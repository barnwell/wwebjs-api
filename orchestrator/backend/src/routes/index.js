const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const instanceRoutes = require('./instances');
const templateRoutes = require('./templates');
const metricsRoutes = require('./metrics');
const settingsRoutes = require('./settings');

const router = express.Router();

// Public routes (no auth required)
router.use('/auth', authRoutes);

// Protected routes (auth required)
router.use('/users', userRoutes);
router.use('/instances', instanceRoutes);
router.use('/templates', templateRoutes);
router.use('/metrics', metricsRoutes);
router.use('/settings', settingsRoutes);

// API info
router.get('/', (req, res) => {
  res.json({
    name: 'wwebjs-orchestrator API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      instances: '/api/instances',
      templates: '/api/templates',
      metrics: '/api/metrics',
      settings: '/api/settings'
    }
  });
});

module.exports = router;

