const express = require('express');
const instanceRoutes = require('./instances');
const templateRoutes = require('./templates');
const metricsRoutes = require('./metrics');
const settingsRoutes = require('./settings');

const router = express.Router();

// Routes
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
      instances: '/api/instances',
      templates: '/api/templates',
      metrics: '/api/metrics',
      settings: '/api/settings'
    }
  });
});

module.exports = router;

