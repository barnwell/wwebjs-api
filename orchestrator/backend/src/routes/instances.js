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
function getNextAvailablePort() {
  const db = getDatabase();
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('next_port');
  const port = parseInt(setting.value);
  
  const maxPort = parseInt(process.env.WWEBJS_PORT_RANGE_END || 3100);
  const nextPort = port >= maxPort ? parseInt(process.env.WWEBJS_PORT_RANGE_START || 3000) : port + 1;
  
  db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
    .run(nextPort.toString(), 'next_port');
  
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
    const instances = db.prepare('SELECT * FROM instances ORDER BY created_at DESC').all();
    
    // Parse JSON config for each instance
    const parsedInstances = instances.map(instance => ({
      ...instance,
      config: JSON.parse(instance.config)
    }));
    
    res.json(parsedInstances);
  } catch (error) {
    logger.error('Error fetching instances:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance by ID
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
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
    const port = getNextAvailablePort();
    
    // Merge with template if provided
    let finalConfig = { ...defaultConfig };
    if (templateId) {
      const template = db.prepare('SELECT config FROM templates WHERE id = ?').get(templateId);
      if (template) {
        finalConfig = { ...finalConfig, ...JSON.parse(template.config) };
      }
    }
    
    // Override with user-provided config
    finalConfig = { ...finalConfig, ...config };
    
    // Set default values
    finalConfig.PORT = finalConfig.PORT || port;
    finalConfig.API_KEY = finalConfig.API_KEY || uuidv4();
    
    // Create instance record
    db.prepare(`
      INSERT INTO instances (id, name, description, port, config, status)
      VALUES (?, ?, ?, ?, ?, 'stopped')
    `).run(id, name, description || '', port, JSON.stringify(finalConfig));
    
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(id);
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
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const config = JSON.parse(instance.config);
    
    // Check if container exists
    if (instance.container_id) {
      // Try to start existing container
      try {
        await startContainer(instance.container_id);
        
        db.prepare(`
          UPDATE instances 
          SET status = 'running', last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(instance.id);
        
        const updatedInstance = db.prepare('SELECT * FROM instances WHERE id = ?').get(instance.id);
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
    
    db.prepare(`
      UPDATE instances 
      SET container_id = ?, status = 'running', last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(container.id, instance.id);
    
    const updatedInstance = db.prepare('SELECT * FROM instances WHERE id = ?').get(instance.id);
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
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance has no container' });
    }
    
    await stopContainer(instance.container_id);
    
    db.prepare(`
      UPDATE instances 
      SET status = 'stopped', session_status = 'disconnected', last_stopped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(instance.id);
    
    const updatedInstance = db.prepare('SELECT * FROM instances WHERE id = ?').get(instance.id);
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
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance has no container' });
    }
    
    await restartContainer(instance.container_id);
    
    db.prepare(`
      UPDATE instances 
      SET last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(instance.id);
    
    const updatedInstance = db.prepare('SELECT * FROM instances WHERE id = ?').get(instance.id);
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
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    // Remove container if exists
    if (instance.container_id) {
      try {
        await removeContainer(instance.container_id, true);
      } catch (error) {
        logger.warn(`Error removing container: ${error.message}`);
      }
    }
    
    // Delete from database
    db.prepare('DELETE FROM instances WHERE id = ?').run(instance.id);
    
    broadcast({ type: 'instance_deleted', data: { id: instance.id } });
    
    logger.info(`Instance deleted: ${instance.name} (${instance.id})`);
    res.json({ message: 'Instance deleted successfully' });
  } catch (error) {
    logger.error('Error deleting instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance stats
router.get('/:id/stats', async (req, res) => {
  try {
    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance has no container' });
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
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (!instance.container_id) {
      return res.status(400).json({ error: 'Instance has no container' });
    }
    
    const tail = parseInt(req.query.tail) || 100;
    const logs = await getContainerLogs(instance.container_id, { tail });
    
    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching instance logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance QR code
router.get('/:id/qr', async (req, res) => {
  try {
    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (instance.status !== 'running') {
      return res.status(400).json({ error: 'Instance is not running' });
    }
    
    const config = JSON.parse(instance.config);
    const apiKey = config.API_KEY;
    
    // Call wwebjs-api to get QR code
    const response = await axios.get(
      `http://localhost:${instance.port}/session/qr/default/image`,
      { 
        headers: { 'x-api-key': apiKey },
        responseType: 'arraybuffer'
      }
    );
    
    const qrCodeBase64 = Buffer.from(response.data).toString('base64');
    
    res.json({ qrCode: `data:image/png;base64,${qrCodeBase64}` });
  } catch (error) {
    logger.error('Error fetching QR code:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance session status
router.get('/:id/session-status', async (req, res) => {
  try {
    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (instance.status !== 'running') {
      return res.json({ status: 'disconnected', message: 'Instance is not running' });
    }
    
    const config = JSON.parse(instance.config);
    const apiKey = config.API_KEY;
    
    // Call wwebjs-api to get session status
    const response = await axios.get(
      `http://localhost:${instance.port}/session/status/default`,
      { headers: { 'x-api-key': apiKey } }
    );
    
    const sessionStatus = response.data.state || 'disconnected';
    
    // Update database
    db.prepare(`
      UPDATE instances 
      SET session_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sessionStatus.toLowerCase(), instance.id);
    
    res.json(response.data);
  } catch (error) {
    logger.error('Error fetching session status:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE instance config
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, config } = req.body;
    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const currentConfig = JSON.parse(instance.config);
    const updatedConfig = config ? { ...currentConfig, ...config } : currentConfig;
    
    db.prepare(`
      UPDATE instances 
      SET name = ?, description = ?, config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || instance.name,
      description !== undefined ? description : instance.description,
      JSON.stringify(updatedConfig),
      instance.id
    );
    
    const updatedInstance = db.prepare('SELECT * FROM instances WHERE id = ?').get(instance.id);
    updatedInstance.config = JSON.parse(updatedInstance.config);
    
    broadcast({ type: 'instance_updated', data: updatedInstance });
    
    logger.info(`Instance updated: ${updatedInstance.name} (${instance.id})`);
    res.json(updatedInstance);
  } catch (error) {
    logger.error('Error updating instance:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

