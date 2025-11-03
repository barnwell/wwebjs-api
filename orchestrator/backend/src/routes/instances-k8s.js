const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { 
  createWwebjsDeployment,
  getDeploymentStatus,
  scaleDeployment,
  deleteDeployment,
  getDeploymentLogs,
  getDeploymentMetrics
} = require('../kubernetes');
const { broadcast } = require('../websocket');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');
const defaultConfig = require('../config/default-instance-config');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

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

// Helper function to build environment variables from config
function buildEnvVars(config) {
  const env = {};
  
  for (const [key, value] of Object.entries(config)) {
    env[key] = value.toString();
  }
  
  return env;
}

// Helper function to check session status for an instance
async function checkInstanceSessionStatus(instance) {
  try {
    if (!instance.deployment_name || instance.status !== 'running') {
      return 'disconnected';
    }
    
    const config = typeof instance.config === 'string' ? JSON.parse(instance.config) : instance.config;
    
    // Use Kubernetes service name for internal communication
    const serviceName = instance.deployment_name;
    const sessionsUrl = `http://${serviceName}.wwebjs-orchestrator.svc.cluster.local:3000/session/getSessions`;
    
    const sessionsResponse = await axios.get(sessionsUrl, {
      headers: {
        'x-api-key': config.API_KEY
      },
      timeout: 5000
    });
    
    if (!sessionsResponse.data.success || !sessionsResponse.data.result || sessionsResponse.data.result.length === 0) {
      return 'disconnected';
    }
    
    // Check if any session is connected
    for (const sessionId of sessionsResponse.data.result) {
      try {
        const statusUrl = `http://${serviceName}.wwebjs-orchestrator.svc.cluster.local:3000/session/status/${sessionId}`;
        const statusResponse = await axios.get(statusUrl, {
          headers: {
            'x-api-key': config.API_KEY
          },
          timeout: 5000
        });
        
        if (statusResponse.data.success && statusResponse.data.state === 'CONNECTED') {
          return 'connected';
        }
      } catch (error) {
        continue;
      }
    }
    
    return 'disconnected';
  } catch (error) {
    logger.debug(`Error checking session status for instance ${instance.name}:`, error.message);
    return 'disconnected';
  }
}

// GET all instances
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    let query, params;
    
    if (req.user.role === 'admin') {
      query = `
        SELECT i.*, u.username as owner_username, u.email as owner_email
        FROM instances i
        JOIN users u ON i.user_id = u.id
        ORDER BY i.created_at DESC
      `;
      params = [];
    } else {
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
    
    // Parse JSON config and check session status for each instance
    const instances = await Promise.all(result.rows.map(async (instance) => {
      const parsedInstance = {
        ...instance,
        config: JSON.parse(instance.config)
      };
      
      // Update status from Kubernetes if deployment exists
      if (parsedInstance.deployment_name) {
        try {
          const k8sStatus = await getDeploymentStatus(parsedInstance.deployment_name);
          parsedInstance.k8s_status = k8sStatus.status;
          parsedInstance.replicas = k8sStatus.replicas;
          parsedInstance.ready_replicas = k8sStatus.readyReplicas;
        } catch (error) {
          logger.warn(`Failed to get K8s status for ${parsedInstance.deployment_name}:`, error.message);
        }
      }
      
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
    
    // Get Kubernetes deployment info
    if (instance.deployment_name) {
      try {
        const k8sStatus = await getDeploymentStatus(instance.deployment_name);
        instance.k8s_status = k8sStatus.status;
        instance.replicas = k8sStatus.replicas;
        instance.ready_replicas = k8sStatus.readyReplicas;
        instance.k8s_conditions = k8sStatus.conditions;
      } catch (error) {
        logger.warn(`Failed to get K8s status for ${instance.deployment_name}:`, error.message);
        instance.k8s_status = 'unknown';
      }
    }
    
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
    const { name, description, config, templateId, assignedUserId } = req.body;
    
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config are required' });
    }
    
    const db = getDatabase();
    const id = uuidv4();

    // Handle user assignment - only admins can assign to other users
    let targetUserId = req.user.id;
    if (assignedUserId && req.user.role === 'admin') {
      const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [assignedUserId]);
      if (userCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Target user not found' });
      }
      targetUserId = assignedUserId;
    } else if (assignedUserId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can assign instances to other users' });
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
    finalConfig.API_KEY = finalConfig.API_KEY || uuidv4();
    
    // Create instance record (no port needed for Kubernetes)
    await db.query(`
      INSERT INTO instances (id, name, description, config, status, user_id)
      VALUES ($1, $2, $3, $4, 'stopped', $5)
    `, [id, name, description || '', JSON.stringify(finalConfig), targetUserId]);
    
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

// START instance
router.post('/:id/start', async (req, res) => {
  try {
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
    
    let deploymentName = instance.deployment_name;
    
    // Check if deployment exists
    if (deploymentName) {
      try {
        const status = await getDeploymentStatus(deploymentName);
        if (status.status === 'running') {
          return res.json({ ...instance, config, status: 'running' });
        } else if (status.status !== 'not-found') {
          // Scale up existing deployment
          await scaleDeployment(deploymentName, 1);
          
          await db.query(`
            UPDATE instances 
            SET status = 'running', last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [instance.id]);
          
          const updatedInstance = { ...instance, config, status: 'running' };
          broadcast({ type: 'instance_started', data: updatedInstance });
          
          return res.json(updatedInstance);
        }
      } catch (error) {
        logger.warn(`Deployment ${deploymentName} not found, creating new one`);
      }
    }
    
    // Create new Kubernetes deployment
    if (!deploymentName) {
      deploymentName = `wwebjs-${instance.name}`;
    }
    
    const deployment = await createWwebjsDeployment({
      name: instance.name,
      instanceId: instance.id,
      env: buildEnvVars(config)
    });
    
    await db.query(`
      UPDATE instances 
      SET status = 'running', deployment_name = $1, last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [deploymentName, instance.id]);
    
    const updatedInstance = { ...instance, config, status: 'running', deployment_name: deploymentName };
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
    
    if (instance.deployment_name) {
      // Scale down to 0 replicas instead of deleting
      await scaleDeployment(instance.deployment_name, 0);
    }
    
    await db.query(`
      UPDATE instances 
      SET status = 'stopped', last_stopped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [instance.id]);
    
    const updatedInstance = { ...instance, config: JSON.parse(instance.config), status: 'stopped' };
    broadcast({ type: 'instance_stopped', data: updatedInstance });
    
    logger.info(`Instance stopped: ${instance.name} (${instance.id})`);
    res.json(updatedInstance);
  } catch (error) {
    logger.error('Error stopping instance:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE instance
router.delete('/:id', async (req, res) => {
  try {
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
    
    // Delete Kubernetes deployment if it exists
    if (instance.deployment_name) {
      try {
        await deleteDeployment(instance.deployment_name);
      } catch (error) {
        logger.warn(`Error deleting deployment ${instance.deployment_name}:`, error.message);
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
    
    if (!instance.deployment_name) {
      return res.json({ error: 'Deployment not found' });
    }
    
    const metrics = await getDeploymentMetrics(instance.deployment_name);
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching instance stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET instance logs
router.get('/:id/logs', async (req, res) => {
  try {
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
    
    if (!instance.deployment_name) {
      return res.json({ error: 'Deployment not found' });
    }
    
    const tail = parseInt(req.query.tail) || 100;
    const logs = await getDeploymentLogs(instance.deployment_name, { tail });
    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching instance logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// SCALE instance (Kubernetes-specific)
router.post('/:id/scale', async (req, res) => {
  try {
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const { replicas } = req.body;
    
    if (typeof replicas !== 'number' || replicas < 0 || replicas > 5) {
      return res.status(400).json({ error: 'Replicas must be a number between 0 and 5' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM instances WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const instance = result.rows[0];
    
    if (!instance.deployment_name) {
      return res.status(400).json({ error: 'Instance not deployed' });
    }
    
    await scaleDeployment(instance.deployment_name, replicas);
    
    const status = replicas > 0 ? 'running' : 'stopped';
    await db.query(`
      UPDATE instances 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, instance.id]);
    
    const updatedInstance = { ...instance, config: JSON.parse(instance.config), status };
    broadcast({ type: 'instance_scaled', data: { ...updatedInstance, replicas } });
    
    logger.info(`Instance ${instance.name} scaled to ${replicas} replicas`);
    res.json({ success: true, replicas, status });
  } catch (error) {
    logger.error('Error scaling instance:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;