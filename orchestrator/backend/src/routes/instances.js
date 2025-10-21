const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getDatabase } = require('../db');
const { 
  createContainer, 
  startContainer, 
  stopContainer, 
  restartContainer, 
  removeContainer,
  getContainerStats,
  getContainerLogs,
  inspectContainer
} = require('../docker');
const { broadcast } = require('../websocket');
const { logger } = require('../utils/logger');
const { authenticateToken, requireOwnershipOrAdmin } = require('../middleware/auth');
const axios = require('axios');
const defaultConfig = require('../config/default-instance-config');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper function to get next available port
async function getNextAvailablePort() {
  const db = getDatabase();
  const result = await db.query('SELECT value FROM settings WHERE key = $1', ['next_port']);
  const port = parseInt(result.rows[0]?.value || process.env.WWEBJS_PORT_RANGE_START || '3000');
  
  const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || 3100);
  const nextPort = port >= maxPort ? parseInt(process.env.WWEBJS_PORT_RANGE_START || 3000) : port + 1;
  
  await db.query('UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2', [nextPort.toString(), 'next_port']);
  
  return port;
}

// Helper function to check if a port is available
async function isPortAvailable(port) {
  const db = getDatabase();
  const result = await db.query('SELECT id FROM instances WHERE port = $1', [port]);
  return result.rows.length === 0;
}

// Helper function to check instance ownership
async function checkInstanceOwnership(instanceId, userId, userRole) {
  if (userRole === 'admin') {
    return true; // Admins can access all instances
  }
  
  const db = getDatabase();
  const result = await db.query('SELECT user_id FROM instances WHERE id = $1', [instanceId]);
  
  if (result.rows.length === 0) {
    return false; // Instance doesn't exist
  }
  
  return result.rows[0].user_id === userId;
}

// Helper function to validate port range
function isValidPort(port) {
  const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '21000');
  const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '22000');
  
  // Enforce the configured port range
  return port >= minPort && port <= maxPort;
}

// Helper function to build environment variables from config
function buildEnvVars(config) {
  const env = [];
  
  for (const [key, value] of Object.entries(config)) {
    env.push(`${key}=${value}`);
  }
  
  return env;
}

// Helper function to check session status for an instance
async function checkInstanceSessionStatus(instance) {
  try {
    if (!instance.container_id || instance.status !== 'running') {
      return 'disconnected';
    }
    
    const config = typeof instance.config === 'string' ? JSON.parse(instance.config) : instance.config;
    const containerName = `wwebjs-${instance.name}`;
    
    // Get all sessions for this instance
    const sessionsUrl = `http://${containerName}:3000/session/getSessions`;
    const sessionsResponse = await axios.get(sessionsUrl, {
      headers: {
        'x-api-key': config.API_KEY
      }
    });
    
    if (!sessionsResponse.data.success || !sessionsResponse.data.result || sessionsResponse.data.result.length === 0) {
      return 'disconnected';
    }
    
    // Check if any session is connected
    for (const sessionId of sessionsResponse.data.result) {
      try {
        const statusUrl = `http://${containerName}:3000/session/status/${sessionId}`;
        const statusResponse = await axios.get(statusUrl, {
          headers: {
            'x-api-key': config.API_KEY
          }
        });
        
        if (statusResponse.data.success && statusResponse.data.state === 'CONNECTED') {
          return 'connected';
        }
      } catch (error) {
        // Continue checking other sessions
        continue;
      }
    }
    
    return 'disconnected';
  } catch (error) {
    logger.debug(`Error checking session status for instance ${instance.name}:`, error.message);
    return 'disconnected';
  }
}

// GET default instance configuration
router.get('/default-config', (req, res) => {
  try {
    res.json(defaultConfig);
  } catch (error) {
    logger.error('Error getting default config:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET port availability
router.get('/port-availability/:port', async (req, res) => {
  try {
    const port = parseInt(req.params.port);
    
    if (!isValidPort(port)) {
      const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '21000');
      const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '22000');
      return res.status(400).json({ 
        available: false,
        error: `Port must be between ${minPort} and ${maxPort}` 
      });
    }
    
    const available = await isPortAvailable(port);
    res.json({ 
      port, 
      available,
      message: available ? 'Port is available' : 'Port is already in use'
    });
  } catch (error) {
    logger.error('Error checking port availability:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET port range configuration
router.get('/port-range', async (req, res) => {
  try {
    const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '21000');
    const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '22000');
    
    res.json({
      minPort,
      maxPort,
      message: `Allowed port range: ${minPort} - ${maxPort}`
    });
  } catch (error) {
    logger.error('Error getting port range:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET available ports in range
router.get('/available-ports', async (req, res) => {
  try {
    const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '21000');
    const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '22000');
    const availablePorts = [];
    
    for (let port = minPort; port <= maxPort; port++) {
      if (await isPortAvailable(port)) {
        availablePorts.push(port);
      }
    }
    
    res.json({ 
      availablePorts,
      range: { min: minPort, max: maxPort },
      count: availablePorts.length
    });
  } catch (error) {
    logger.error('Error getting available ports:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all instances
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    let query, params;
    
    if (req.user.role === 'admin') {
      // Admins can see all instances with owner information
      query = `
        SELECT i.*, u.username as owner_username, u.email as owner_email
        FROM instances i
        JOIN users u ON i.user_id = u.id
        ORDER BY i.created_at DESC
      `;
      params = [];
    } else {
      // Regular users can only see their own instances
      query = `
        SELECT i.*, u.username as owner_username, u.email as owner_email
        FROM instances i
        JOIN users u ON i.user_id = u.id
        WHERE i.user_id = $1
        ORDER BY i.created_at DESC
      `;
      params = [req.user.id];
    }
    
    const result = await db.query(query, params);
    
    // Parse JSON config for each instance and check session status
    const instances = await Promise.all(result.rows.map(async (instance) => {
      const parsedInstance = {
        ...instance,
        config: JSON.parse(instance.config)
      };
      
      // Check session status dynamically
      parsedInstance.session_status = await checkInstanceSessionStatus(parsedInstance);
      
      return parsedInstance;
    }));
    
    res.json(instances);
  } catch (error) {
    logger.error('Error fetching instances:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance by ID
router.get('/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query(`
      SELECT i.*, u.username as owner_username, u.email as owner_email
      FROM instances i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    instance.config = JSON.parse(instance.config);
    
    // Check session status dynamically
    instance.session_status = await checkInstanceSessionStatus(instance);
    
    res.json(instance);
  } catch (error) {
    logger.error('Error fetching instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// CREATE new instance
router.post('/', async (req, res) => {
  try {
    const { name, description, config, templateId, port: requestedPort } = req.body;
    
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config are required' });
    }
    
    const db = getDatabase();
    const id = uuidv4();
    
    // Handle port assignment
    let port;
    if (requestedPort) {
      // Validate requested port
      if (!isValidPort(requestedPort)) {
        return res.status(400).json({ 
          error: `Port must be between 1 and 65535` 
        });
      }
      
      // Check if port is available
      if (!(await isPortAvailable(requestedPort))) {
        return res.status(400).json({ 
          error: `Port ${requestedPort} is already in use` 
        });
      }
      
      port = requestedPort;
    } else {
      // Auto-assign port
      port = await getNextAvailablePort();
    }
    
    // Merge with template if provided
    let finalConfig = { ...defaultConfig };
    if (templateId) {
      const templateResult = await db.query('SELECT config FROM templates WHERE id = $1', [templateId]);
      if (templateResult.rows.length > 0) {
        finalConfig = { ...finalConfig, ...JSON.parse(templateResult.rows[0].config) };
      }
    }
    
    // Override with user-provided config
    finalConfig = { ...finalConfig, ...config };
    
    // Set default values
    finalConfig.PORT = finalConfig.PORT || port;
    finalConfig.API_KEY = finalConfig.API_KEY || uuidv4();
    
    // Create instance record
    await db.query(`
      INSERT INTO instances (id, name, description, port, config, status, user_id)
      VALUES ($1, $2, $3, $4, $5, 'stopped', $6)
    `, [id, name, description || '', port, JSON.stringify(finalConfig), req.user.id]);
    
    const instanceResult = await db.query(`
      SELECT i.*, u.username as owner_username, u.email as owner_email
      FROM instances i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [id]);
    const instance = instanceResult.rows[0];
    instance.config = JSON.parse(instance.config);
    
    broadcast({ type: 'instance_created', data: instance });
    
    logger.info(`Instance created: ${name} (${id})`);
    res.status(201).json(instance);
  } catch (error) {
    logger.error('Error creating instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE instance
router.patch('/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const { name, description, config, port: requestedPort } = req.body;
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const currentConfig = JSON.parse(instance.config);
    
    // Handle port change if requested
    let port = instance.port;
    if (requestedPort && requestedPort !== instance.port) {
      // Validate requested port
      if (!isValidPort(requestedPort)) {
        return res.status(400).json({ 
          error: `Port must be between 1 and 65535` 
        });
      }
      
      // Check if port is available (excluding current instance)
      const portCheck = await db.query('SELECT id FROM instances WHERE port = $1 AND id != $2', [requestedPort, instance.id]);
      if (portCheck.rows.length > 0) {
        return res.status(400).json({ 
          error: `Port ${requestedPort} is already in use` 
        });
      }
      
      port = requestedPort;
    }
    
    // Merge configuration changes
    let updatedConfig = { ...currentConfig };
    if (config) {
      updatedConfig = { ...updatedConfig, ...config };
      // Update port in config if changed
      if (port !== instance.port) {
        updatedConfig.PORT = port;
      }
    }
    
    // Update instance in database
    await db.query(`
      UPDATE instances 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          port = $3,
          config = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [
      name || instance.name,
      description !== undefined ? description : instance.description,
      port,
      JSON.stringify(updatedConfig),
      instance.id
    ]);
    
    const updatedResult = await db.query(`
      SELECT i.*, u.username as owner_username, u.email as owner_email
      FROM instances i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = $1
    `, [instance.id]);
    const updatedInstance = updatedResult.rows[0];
    updatedInstance.config = JSON.parse(updatedInstance.config);
    
    broadcast({ type: 'instance_updated', data: updatedInstance });
    
    logger.info(`Instance updated: ${updatedInstance.name} (${updatedInstance.id})`);
    res.json(updatedInstance);
  } catch (error) {
    logger.error('Error updating instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// START instance
router.post('/:id/start', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    // Check if container exists
    if (instance.container_id) {
      // Try to start existing container
      try {
        await startContainer(instance.container_id);
        
        await db.query(`
          UPDATE instances 
          SET status = 'running', last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [instance.id]);
        
        const updatedResult = await db.query(`
          SELECT i.*, u.username as owner_username, u.email as owner_email
          FROM instances i
          JOIN users u ON i.user_id = u.id
          WHERE i.id = $1
        `, [instance.id]);
        const updatedInstance = updatedResult.rows[0];
        updatedInstance.config = JSON.parse(updatedInstance.config);
        
        broadcast({ type: 'instance_started', data: updatedInstance });
        
        return res.json(updatedInstance);
      } catch (error) {
        // Container might be removed, create new one
        logger.warn(`Container ${instance.container_id} not found, creating new one`);
      }
    }
    
    // Create new container
    const sessionsPath = path.resolve(process.env.WWEBJS_SESSIONS_PATH || './instances', instance.name);
    
    const container = await createContainer({
      image: process.env.WWEBJS_IMAGE || 'wwebjs-api:latest',
      name: `wwebjs-${instance.name}`,
      env: buildEnvVars(config),
      exposedPorts: { '3000/tcp': {} },
      portBindings: { '3000/tcp': [{ HostPort: instance.port.toString() }] },
      volumes: [`${sessionsPath}:/usr/src/app/sessions`],
      restartPolicy: { Name: 'unless-stopped' },
      labels: {
        'orchestrator.instance.id': instance.id,
        'orchestrator.instance.name': instance.name
      }
    });
    
    await container.start();
    
    await db.query(`
      UPDATE instances 
      SET status = 'running', container_id = $1, last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [container.id, instance.id]);
    
    const updatedResult = await db.query('SELECT * FROM instances WHERE id = $1', [instance.id]);
    const updatedInstance = updatedResult.rows[0];
    updatedInstance.config = JSON.parse(updatedInstance.config);
    
    broadcast({ type: 'instance_started', data: updatedInstance });
    
    logger.info(`Instance started: ${instance.name} (${instance.id})`);
    res.json(updatedInstance);
  } catch (error) {
    logger.error('Error starting instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// STOP instance
router.post('/:id/stop', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.container_id) {
      await stopContainer(instance.container_id);
    }
    
    await db.query(`
      UPDATE instances 
      SET status = 'stopped', last_stopped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [instance.id]);
    
    const updatedResult = await db.query('SELECT * FROM instances WHERE id = $1', [instance.id]);
    const updatedInstance = updatedResult.rows[0];
    updatedInstance.config = JSON.parse(updatedInstance.config);
    
    broadcast({ type: 'instance_stopped', data: updatedInstance });
    
    logger.info(`Instance stopped: ${instance.name} (${instance.id})`);
    res.json(updatedInstance);
  } catch (error) {
    logger.error('Error stopping instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// RESTART instance
router.post('/:id/restart', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.container_id) {
      await restartContainer(instance.container_id);
    }
    
    await db.query(`
      UPDATE instances 
      SET status = 'running', last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [instance.id]);
    
    const updatedResult = await db.query('SELECT * FROM instances WHERE id = $1', [instance.id]);
    const updatedInstance = updatedResult.rows[0];
    updatedInstance.config = JSON.parse(updatedInstance.config);
    
    broadcast({ type: 'instance_restarted', data: updatedInstance });
    
    logger.info(`Instance restarted: ${instance.name} (${instance.id})`);
    res.json(updatedInstance);
  } catch (error) {
    logger.error('Error restarting instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE instance
router.delete('/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    // Stop and remove container if it exists
    if (instance.container_id) {
      try {
        await stopContainer(instance.container_id);
        await removeContainer(instance.container_id);
      } catch (error) {
        logger.warn(`Error removing container ${instance.container_id}:`, error.message);
      }
    }
    
    // Delete instance from database
    await db.query('DELETE FROM instances WHERE id = $1', [instance.id]);
    
    broadcast({ type: 'instance_deleted', data: { id: instance.id } });
    
    logger.info(`Instance deleted: ${instance.name} (${instance.id})`);
    res.json({ success: true, message: 'Instance deleted successfully' });
  } catch (error) {
    logger.error('Error deleting instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance stats
router.get('/:id/stats', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (!instance.container_id) {
      return res.json({ error: 'Container not found' });
    }
    
    const stats = await getContainerStats(instance.container_id);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching instance stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance logs
router.get('/:id/logs', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (!instance.container_id) {
      return res.json({ error: 'Container not found' });
    }
    
    const tail = parseInt(req.query.tail) || 100;
    const logs = await getContainerLogs(instance.container_id, tail);
    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching instance logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET QR code for instance
router.get('/:id/qr', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance not running' });
    }
    
    // Get QR code from wwebjs-api instance
    // Use container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const qrUrl = `http://${containerName}:3000/session/qr/default`;
    const qrResponse = await axios.get(qrUrl, {
      headers: {
        'x-api-key': config.API_KEY
      }
    });
    
    res.json({ qr: qrResponse.data });
  } catch (error) {
    logger.error('Error fetching QR code:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET session status
router.get('/:id/session-status', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    if (!instance.container_id) {
      return res.json({ status: 'disconnected', message: 'Instance not running' });
    }
    
    // Get session status from wwebjs-api instance
    // Use container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const statusUrl = `http://${containerName}:3000/session/status/default`;
    const statusResponse = await axios.get(statusUrl, {
      headers: {
        'x-api-key': config.API_KEY
      }
    });
    
    res.json(statusResponse.data);
  } catch (error) {
    logger.error('Error fetching session status:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all sessions for an instance
router.get('/:id/sessions', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    if (!instance.container_id) {
      return res.json({ sessions: [], message: 'Instance not running' });
    }
    
    // Get all sessions from wwebjs-api instance
    // Use container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const sessionsUrl = `http://${containerName}:3000/session/getSessions`;
    const sessionsResponse = await axios.get(sessionsUrl, {
      headers: {
        'x-api-key': config.API_KEY
      }
    });
    
    // Get detailed status for each session
    const sessions = [];
    if (sessionsResponse.data.success && sessionsResponse.data.result) {
      for (const sessionId of sessionsResponse.data.result) {
        try {
          const statusUrl = `http://${containerName}:3000/session/status/${sessionId}`;
          const statusResponse = await axios.get(statusUrl, {
            headers: {
              'x-api-key': config.API_KEY
            }
          });
          sessions.push({
            id: sessionId,
            status: statusResponse.data.success ? 'connected' : 'disconnected',
            state: statusResponse.data.state || 'unknown',
            message: statusResponse.data.message || ''
          });
        } catch (error) {
          sessions.push({
            id: sessionId,
            status: 'error',
            state: 'unknown',
            message: 'Failed to get status'
          });
        }
      }
    }
    
    res.json({ sessions });
  } catch (error) {
    logger.error('Error fetching sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE a specific session
router.delete('/:id/sessions/:sessionId', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance not running' });
    }
    
    // Terminate the session
    // Use container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const terminateUrl = `http://${containerName}:3000/session/terminate/${req.params.sessionId}`;
    const terminateResponse = await axios.get(terminateUrl, {
      headers: {
        'x-api-key': config.API_KEY
      }
    });
    
    res.json(terminateResponse.data);
  } catch (error) {
    logger.error('Error terminating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE all sessions for an instance
router.delete('/:id/sessions', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance not running' });
    }
    
    // Terminate all sessions
    // Use container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const terminateUrl = `http://${containerName}:3000/session/terminateAll`;
    const terminateResponse = await axios.get(terminateUrl, {
      headers: {
        'x-api-key': config.API_KEY
      }
    });
    
    res.json(terminateResponse.data);
  } catch (error) {
    logger.error('Error terminating all sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET resource usage for an instance
router.get('/:id/resources', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.status !== 'running') {
      return res.json({ 
        cpu: 0, 
        memory: 0, 
        memoryUsed: 0,
        memoryLimit: 0,
        message: 'Instance not running' 
      });
    }
    
    // Get latest metrics from the database instead of calculating from Docker stats
    const metricsResult = await db.query(`
      SELECT cpu_usage, memory_usage, memory_limit, timestamp
      FROM metrics 
      WHERE instance_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [req.params.id]);
    
    if (metricsResult.rows.length === 0) {
      // No metrics available yet, try to get basic container stats
      if (!instance.container_id) {
        return res.json({ 
          cpu: 0, 
          memory: 0, 
          memoryUsed: 0,
          memoryLimit: 0,
          message: 'No metrics available yet' 
        });
      }
      
      try {
        const stats = await getContainerStats(instance.container_id);
        const memoryUsed = stats.memory_stats?.usage || 0;
        const memoryLimit = stats.memory_stats?.limit || 0;
        const memoryUsage = memoryLimit > 0 ? (memoryUsed / memoryLimit) * 100 : 0;
        
        return res.json({
          cpu: 0, // CPU calculation from Docker stats is unreliable
          memory: Math.round(memoryUsage * 100) / 100,
          memoryUsed: memoryUsed,
          memoryLimit: memoryLimit,
          timestamp: new Date().toISOString(),
          message: 'Using basic container stats (metrics collection may not be running)'
        });
      } catch (statsError) {
        logger.error('Error fetching container stats:', statsError);
        return res.json({ 
          cpu: 0, 
          memory: 0, 
          memoryUsed: 0,
          memoryLimit: 0,
          message: 'Unable to fetch resource data' 
        });
      }
    }
    
    const latestMetric = metricsResult.rows[0];
    const memoryLimit = parseFloat(latestMetric.memory_limit) || 0;
    const memoryUsagePercent = parseFloat(latestMetric.memory_usage) || 0;
    const memoryUsed = memoryLimit > 0 ? (memoryUsagePercent / 100) * memoryLimit : 0;
    
    res.json({
      cpu: parseFloat(latestMetric.cpu_usage) || 0,
      memory: memoryUsagePercent,
      memoryUsed: Math.round(memoryUsed),
      memoryLimit: Math.round(memoryLimit),
      timestamp: latestMetric.timestamp
    });
  } catch (error) {
    logger.error('Error fetching resource usage:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET session class info from wwebjs-api
router.get('/:id/session-class-info/:sessionId', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.status !== 'running') {
      return res.status(400).json({ error: 'Instance is not running' });
    }
    
    // Parse instance config to get API key
    const config = JSON.parse(instance.config);
    const apiKey = config.API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key not configured for this instance' });
    }
    
    // Make request to wwebjs-api using container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const wwebjsUrl = `http://${containerName}:3000/client/getClassInfo/${req.params.sessionId}`;
    
    try {
      logger.info(`Requesting session class info from: ${wwebjsUrl} with API key: ${apiKey ? 'present' : 'missing'}`);
      
      const response = await axios.get(wwebjsUrl, { 
        timeout: 10000,
        headers: {
          'x-api-key': apiKey
        }
      });
      res.json(response.data);
    } catch (apiError) {
      logger.error('Session class info request failed:', {
        url: wwebjsUrl,
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        message: apiError.message
      });
      
      if (apiError.response?.status === 401) {
        res.status(401).json({ error: 'Invalid API key for wwebjs-api' });
      } else {
        res.status(500).json({ error: 'Failed to fetch session info from wwebjs-api' });
      }
    }
  } catch (error) {
    logger.error('Error in session class info route:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET session QR code from wwebjs-api
router.get('/:id/session-qr/:sessionId', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (instance.status !== 'running') {
      return res.status(400).json({ error: 'Instance is not running' });
    }
    
    // Parse instance config to get API key
    const config = JSON.parse(instance.config);
    const apiKey = config.API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key not configured for this instance' });
    }
    
    // Make request to wwebjs-api for QR code using container name for Docker networking
    const containerName = `wwebjs-${instance.name}`;
    const wwebjsUrl = `http://${containerName}:3000/session/qr/${req.params.sessionId}/image`;
    
    try {
      logger.info(`Requesting QR code from: ${wwebjsUrl} with API key: ${apiKey ? 'present' : 'missing'}`);
      
      const response = await axios.get(wwebjsUrl, { 
        timeout: 10000,
        responseType: 'arraybuffer',
        headers: {
          'x-api-key': apiKey
        }
      });
      
      // Return the QR code image
      res.set('Content-Type', 'image/png');
      res.send(response.data);
    } catch (apiError) {
      logger.error('QR code request failed:', {
        url: wwebjsUrl,
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data?.toString(),
        message: apiError.message
      });
      
      if (apiError.response?.status === 404) {
        res.status(404).json({ error: 'QR code not available for this session' });
      } else if (apiError.response?.status === 401) {
        res.status(401).json({ error: 'Invalid API key for wwebjs-api' });
      } else {
        res.status(500).json({ error: 'Failed to fetch QR code from wwebjs-api' });
      }
    }
  } catch (error) {
    logger.error('Error in session QR route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to test wwebjs-api connectivity
router.get('/:id/debug-connectivity', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    const containerName = `wwebjs-${instance.name}`;
    
    const tests = [];
    
    // Test 1: Container name connectivity
    try {
      const containerUrl = `http://${containerName}:3000/health`;
      const containerResponse = await axios.get(containerUrl, { 
        timeout: 5000,
        headers: { 'x-api-key': config.API_KEY }
      });
      tests.push({ 
        test: 'Container name connectivity', 
        url: containerUrl,
        status: 'success', 
        response: containerResponse.status 
      });
    } catch (error) {
      tests.push({ 
        test: 'Container name connectivity', 
        url: `http://${containerName}:3000/health`,
        status: 'failed', 
        error: error.message 
      });
    }
    
    // Test 2: Localhost connectivity
    try {
      const localhostUrl = `http://localhost:${instance.port}/health`;
      const localhostResponse = await axios.get(localhostUrl, { 
        timeout: 5000,
        headers: { 'x-api-key': config.API_KEY }
      });
      tests.push({ 
        test: 'Localhost connectivity', 
        url: localhostUrl,
        status: 'success', 
        response: localhostResponse.status 
      });
    } catch (error) {
      tests.push({ 
        test: 'Localhost connectivity', 
        url: `http://localhost:${instance.port}/health`,
        status: 'failed', 
        error: error.message 
      });
    }
    
    res.json({
      instance: {
        id: instance.id,
        name: instance.name,
        port: instance.port,
        status: instance.status,
        containerName: containerName,
        hasApiKey: !!config.API_KEY
      },
      tests
    });
  } catch (error) {
    logger.error('Error in debug connectivity route:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET backup of instance sessions
router.get('/:id/backup', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    const config = JSON.parse(instance.config);
    
    if (instance.status !== 'running') {
      return res.status(400).json({ error: 'Instance must be running to create backup' });
    }
    
    // Get backup from wwebjs-api instance
    const containerName = `wwebjs-${instance.name}`;
    const backupUrl = `http://${containerName}:3000/session/backup`;
    
    const response = await axios.get(backupUrl, {
      headers: {
        'x-api-key': config.API_KEY
      },
      responseType: 'stream'
    });
    
    // Set response headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${instance.name}-sessions-backup-${new Date().toISOString().split('T')[0]}.zip"`);
    
    // Pipe the backup stream to the response
    response.data.pipe(res);
  } catch (error) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;