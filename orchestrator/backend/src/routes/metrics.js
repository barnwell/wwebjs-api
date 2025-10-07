const express = require('express');
const { getDatabase } = require('../db');
const { getContainerStats } = require('../docker');
const { logger } = require('../utils/logger');

const router = express.Router();

// GET metrics for an instance
router.get('/instance/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { timeRange = '1h' } = req.query;
    
    // Calculate time filter
    let timeFilter = "datetime('now', '-1 hour')";
    if (timeRange === '24h') timeFilter = "datetime('now', '-1 day')";
    if (timeRange === '7d') timeFilter = "datetime('now', '-7 days')";
    if (timeRange === '30d') timeFilter = "datetime('now', '-30 days')";
    
    const metrics = db.prepare(`
      SELECT * FROM metrics 
      WHERE instance_id = ? AND timestamp >= ${timeFilter}
      ORDER BY timestamp DESC
      LIMIT 1000
    `).all(req.params.id);
    
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET latest metrics for all instances
router.get('/latest', async (req, res) => {
  try {
    const db = getDatabase();
    
    const metrics = db.prepare(`
      SELECT m1.*
      FROM metrics m1
      INNER JOIN (
        SELECT instance_id, MAX(timestamp) as max_timestamp
        FROM metrics
        GROUP BY instance_id
      ) m2 ON m1.instance_id = m2.instance_id AND m1.timestamp = m2.max_timestamp
    `).all();
    
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching latest metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST collect metrics for an instance
router.post('/collect/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const instance = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
    
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    if (!instance.container_id || instance.status !== 'running') {
      return res.status(400).json({ error: 'Instance is not running' });
    }
    
    const stats = await getContainerStats(instance.container_id);
    
    db.prepare(`
      INSERT INTO metrics (instance_id, cpu_usage, memory_usage, memory_limit, network_rx, network_tx)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      instance.id,
      parseFloat(stats.cpuUsage),
      parseFloat(stats.memoryUsage),
      parseFloat(stats.memoryLimit),
      parseFloat(stats.networkRx),
      parseFloat(stats.networkTx)
    );
    
    res.json({ message: 'Metrics collected successfully', stats });
  } catch (error) {
    logger.error('Error collecting metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE old metrics
router.delete('/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.query;
    const db = getDatabase();
    
    const result = db.prepare(`
      DELETE FROM metrics 
      WHERE timestamp < datetime('now', '-${parseInt(daysToKeep)} days')
    `).run();
    
    logger.info(`Cleaned up ${result.changes} old metric records`);
    res.json({ deleted: result.changes });
  } catch (error) {
    logger.error('Error cleaning up metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

