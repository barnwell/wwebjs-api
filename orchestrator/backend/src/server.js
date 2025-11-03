const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const { initDatabase, closeDatabase } = require('./db');
const { initDocker } = require('./docker');
const { initWebSocket } = require('./websocket');
const metricsCollector = require('./services/metricsCollector');
const routes = require('./routes');
const { logger } = require('./utils/logger');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize services
async function start() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // Initialize container orchestration (Docker or Kubernetes)
    if (process.env.KUBERNETES_MODE === 'true') {
      const { initKubernetes } = require('./kubernetes');
      await initKubernetes();
      logger.info('Kubernetes client initialized');
    } else {
      await initDocker();
      logger.info('Docker connection established');
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Orchestrator backend running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

    // Initialize WebSocket server
    initWebSocket(server);
    logger.info('WebSocket server initialized');

    // Start metrics collector if enabled
    if (process.env.ENABLE_METRICS !== 'false') {
      metricsCollector.start();
      logger.info('Metrics collector started');
    } else {
      logger.info('Metrics collection disabled');
    }

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      metricsCollector.stop();
      closeDatabase();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      metricsCollector.stop();
      closeDatabase();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

