const express = require('express');
const systemMonitor = require('../services/systemMonitor');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET system status
router.get('/status', async (req, res) => {
  try {
    const systemStatus = systemMonitor.getSystemStatus();
    res.json(systemStatus);
  } catch (error) {
    logger.error('Error getting system status:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET memory information
router.get('/memory', async (req, res) => {
  try {
    const memoryInfo = systemMonitor.getMemoryInfo();
    res.json(memoryInfo);
  } catch (error) {
    logger.error('Error getting memory info:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET CPU information
router.get('/cpu', async (req, res) => {
  try {
    const cpuInfo = systemMonitor.getCpuInfo();
    res.json(cpuInfo);
  } catch (error) {
    logger.error('Error getting CPU info:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET session creation eligibility
router.get('/can-create-session', async (req, res) => {
  try {
    const result = systemMonitor.canCreateNewSession();
    res.json(result);
  } catch (error) {
    logger.error('Error checking session creation eligibility:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET current memory threshold
router.get('/memory-threshold', async (req, res) => {
  try {
    const threshold = systemMonitor.getMinMemoryThreshold();
    res.json({ 
      threshold,
      unit: 'MB',
      description: 'Minimum memory required to create new sessions'
    });
  } catch (error) {
    logger.error('Error getting memory threshold:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT update memory threshold (admin only)
router.put('/memory-threshold', async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { threshold } = req.body;
    
    if (!threshold || typeof threshold !== 'number' || threshold < 0) {
      return res.status(400).json({ 
        error: 'Valid threshold value in MB is required' 
      });
    }

    systemMonitor.setMinMemoryThreshold(threshold);
    
    res.json({ 
      success: true,
      threshold,
      unit: 'MB',
      message: `Memory threshold updated to ${threshold}MB`
    });
  } catch (error) {
    logger.error('Error updating memory threshold:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;