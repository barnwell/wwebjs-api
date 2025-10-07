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
    const { name, description, config, templateId } = req.body;
    
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config are required' });
    }
    
    const db = getDatabase();
    const id = uuidv4();
    const port = await getNextAvailablePort();
    
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
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance not running' });
    }
    
    // Get QR code from wwebjs-api instance
    const qrUrl = `http://localhost:${instance.port}/session/qr/default`;
    const qrResponse = await axios.get(qrUrl);
    
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
    
    if (!instance.container_id) {
      return res.json({ status: 'disconnected', message: 'Instance not running' });
    }
    
    // Get session status from wwebjs-api instance
    const statusUrl = `http://localhost:${instance.port}/session/status/default`;
    const statusResponse = await axios.get(statusUrl);
    
    res.json(statusResponse.data);
  } catch (error) {
    logger.error('Error fetching session status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;