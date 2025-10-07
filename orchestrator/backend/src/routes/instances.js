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
const axios = require('axios');
const defaultConfig = require('../config/default-instance-config');

const router = express.Router();

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

// Helper function to validate port range
function isValidPort(port) {
  const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '3000');
  const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '3100');
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
      const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '3000');
      const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '3100');
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

// GET available ports in range
router.get('/available-ports', async (req, res) => {
  try {
    const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '3000');
    const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '3100');
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
    const result = await db.query('SELECT * FROM instances ORDER BY created_at DESC');
    
    // Parse JSON config for each instance
    const instances = result.rows.map(instance => ({
      ...instance,
      config: JSON.parse(instance.config)
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
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    instance.config = JSON.parse(instance.config);
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
        const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '3000');
        const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '3100');
        return res.status(400).json({ 
          error: `Port must be between ${minPort} and ${maxPort}` 
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
      INSERT INTO instances (id, name, description, port, config, status)
      VALUES ($1, $2, $3, $4, $5, 'stopped')
    `, [id, name, description || '', port, JSON.stringify(finalConfig)]);
    
    const instanceResult = await db.query('SELECT * FROM instances WHERE id = $1', [id]);
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
        const minPort = parseInt(process.env.WWEBJS_PORT_RANGE_START || '3000');
        const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || '3100');
        return res.status(400).json({ 
          error: `Port must be between ${minPort} and ${maxPort}` 
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
    
    const updatedResult = await db.query('SELECT * FROM instances WHERE id = $1', [instance.id]);
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
        
        const updatedResult = await db.query('SELECT * FROM instances WHERE id = $1', [instance.id]);
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
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (!instance.container_id) {
      return res.json({ 
        cpu: 0, 
        memory: 0, 
        memoryLimit: 0,
        message: 'Instance not running' 
      });
    }
    
    // Get container stats
    const stats = await getContainerStats(instance.container_id);
    
    // Calculate resource usage
    const cpuUsage = stats.cpu_stats ? 
      ((stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage) / 
       (stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage)) * 100 : 0;
    
    const memoryUsage = stats.memory_stats ? 
      (stats.memory_stats.usage / stats.memory_stats.limit) * 100 : 0;
    
    const memoryLimit = stats.memory_stats ? stats.memory_stats.limit : 0;
    const memoryUsed = stats.memory_stats ? stats.memory_stats.usage : 0;
    
    res.json({
      cpu: Math.round(cpuUsage * 100) / 100,
      memory: Math.round(memoryUsage * 100) / 100,
      memoryUsed: memoryUsed,
      memoryLimit: memoryLimit,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching resource usage:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;