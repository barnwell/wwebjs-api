const { getDatabase } = require('./db');
const { getContainerStats } = require('./docker');
const { logger } = require('./utils/logger');

class MetricsCollector {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.collectionInterval = parseInt(process.env.METRICS_INTERVAL) || 5000; // 5 seconds default
  }

  start() {
    if (this.isRunning) {
      logger.warn('Metrics collector is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting metrics collector with ${this.collectionInterval}ms interval`);

    this.intervalId = setInterval(async () => {
      await this.collectMetrics();
    }, this.collectionInterval);
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Metrics collector is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Metrics collector stopped');
  }

  async collectMetrics() {
    try {
      const db = getDatabase();
      
      // Get all running instances
      const instances = db.prepare(`
        SELECT id, name, container_id 
        FROM instances 
        WHERE status = 'running' AND container_id IS NOT NULL
      `).all();

      if (instances.length === 0) {
        return; // No running instances to collect metrics for
      }

      const collectionPromises = instances.map(async (instance) => {
        try {
          const stats = await getContainerStats(instance.container_id);
          
          // Insert metrics into database
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

          logger.debug(`Metrics collected for instance: ${instance.name}`);
        } catch (error) {
          logger.error(`Error collecting metrics for instance ${instance.name}:`, error.message);
        }
      });

      await Promise.all(collectionPromises);
    } catch (error) {
      logger.error('Error in metrics collection cycle:', error);
    }
  }

  async cleanupOldMetrics(daysToKeep = 30) {
    try {
      const db = getDatabase();
      const result = db.prepare(`
        DELETE FROM metrics 
        WHERE timestamp < datetime('now', '-${daysToKeep} days')
      `).run();

      logger.info(`Cleaned up ${result.changes} old metrics records`);
      return result.changes;
    } catch (error) {
      logger.error('Error cleaning up old metrics:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      collectionInterval: this.collectionInterval,
      intervalId: this.intervalId
    };
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;
