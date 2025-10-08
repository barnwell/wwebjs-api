const express = require('express');
const { getDatabase } = require('../db');
const { getContainerStats } = require('../docker');
const metricsCollector = require('../services/metricsCollector');
const { logger } = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper function to check instance ownership for metrics
async function checkInstanceOwnership(instanceId, userId, userRole) {
  if (userRole === 'admin') {
    return true; // Admins can access all metrics
  }
  
  const db = getDatabase();
  const result = await db.query('SELECT user_id FROM instances WHERE id = $1', [instanceId]);
  
  if (result.rows.length === 0) {
    return false; // Instance doesn't exist
  }
  
  return result.rows[0].user_id === userId;
}

// GET metrics for an instance
router.get('/instance/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkInstanceOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const db = getDatabase();
    const { timeRange = '1h' } = req.query;
    
    // Calculate time filter
    let timeFilter = "NOW() - INTERVAL '1 hour'";
    if (timeRange === '24h') timeFilter = "NOW() - INTERVAL '1 day'";
    if (timeRange === '7d') timeFilter = "NOW() - INTERVAL '7 days'";
    if (timeRange === '30d') timeFilter = "NOW() - INTERVAL '30 days'";
    
    const result = await db.query(`
      SELECT * FROM metrics 
      WHERE instance_id = $1 AND timestamp >= ${timeFilter}
      ORDER BY timestamp DESC
      LIMIT 1000
    `, [req.params.id]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET latest metrics for all instances
router.get('/latest', async (req, res) => {
  try {
    const db = getDatabase();
    let query;
    
    if (req.user.role === 'admin') {
      // Admins can see metrics for all instances
      query = `
        SELECT m1.*
        FROM metrics m1
        INNER JOIN (
          SELECT instance_id, MAX(timestamp) as max_timestamp
          FROM metrics
          GROUP BY instance_id
        ) m2 ON m1.instance_id = m2.instance_id AND m1.timestamp = m2.max_timestamp
      `;
    } else {
      // Regular users can only see metrics for their own instances
      query = `
        SELECT m1.*
        FROM metrics m1
        INNER JOIN (
          SELECT instance_id, MAX(timestamp) as max_timestamp
          FROM metrics m
          INNER JOIN instances i ON m.instance_id = i.id
          WHERE i.user_id = '${req.user.id}'
          GROUP BY instance_id
        ) m2 ON m1.instance_id = m2.instance_id AND m1.timestamp = m2.max_timestamp
      `;
    }
    
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching latest metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST collect metrics for an instance
router.post('/collect/:id', async (req, res) => {
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
    
    if (!instance.container_id || instance.status !== 'running') {
      return res.status(400).json({ error: 'Instance is not running' });
    }
    
    const stats = await getContainerStats(instance.container_id);
    
    await db.query(`
      INSERT INTO metrics (instance_id, cpu_usage, memory_usage, memory_limit, network_rx, network_tx)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      instance.id,
      parseFloat(stats.cpuUsage),
      parseFloat(stats.memoryUsage),
      parseFloat(stats.memoryLimit),
      parseFloat(stats.networkRx),
      parseFloat(stats.networkTx)
    ]);
    
    res.json({ message: 'Metrics collected successfully', stats });
  } catch (error) {
    logger.error('Error collecting metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET metrics collector status (admin only)
router.get('/collector/status', requireAdmin, (req, res) => {
  try {
    const status = metricsCollector.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error getting metrics collector status:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST start metrics collector (admin only)
router.post('/collector/start', requireAdmin, (req, res) => {
  try {
    metricsCollector.start();
    res.json({ message: 'Metrics collector started' });
  } catch (error) {
    logger.error('Error starting metrics collector:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST stop metrics collector (admin only)
router.post('/collector/stop', requireAdmin, (req, res) => {
  try {
    metricsCollector.stop();
    res.json({ message: 'Metrics collector stopped' });
  } catch (error) {
    logger.error('Error stopping metrics collector:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE old metrics (admin only)
router.delete('/cleanup', requireAdmin, async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.query;
    const deletedCount = await metricsCollector.cleanupOldMetrics(parseInt(daysToKeep));
    res.json({ message: `Cleaned up ${deletedCount} old metrics records` });
  } catch (error) {
    logger.error('Error cleaning up metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;