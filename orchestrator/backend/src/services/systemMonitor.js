const os = require('os');
const { logger } = require('../utils/logger');

class SystemMonitor {
  constructor() {
    this.minMemoryThreshold = parseInt(process.env.MIN_MEMORY_THRESHOLD_MB) || 1024; // 1GB default
  }

  /**
   * Get current system memory information
   * @returns {Object} Memory information in MB
   */
  getMemoryInfo() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    return {
      total: Math.round(totalMemory / (1024 * 1024)), // Convert to MB
      free: Math.round(freeMemory / (1024 * 1024)),
      used: Math.round(usedMemory / (1024 * 1024)),
      usagePercent: Math.round((usedMemory / totalMemory) * 100),
      availableForNewSessions: Math.round(freeMemory / (1024 * 1024)) - this.minMemoryThreshold
    };
  }

  /**
   * Check if there's enough memory available for creating a new session
   * @returns {Object} Result with canCreate flag and memory info
   */
  canCreateNewSession() {
    const memoryInfo = this.getMemoryInfo();
    const canCreate = memoryInfo.free >= this.minMemoryThreshold;
    
    return {
      canCreate,
      memoryInfo,
      minThreshold: this.minMemoryThreshold,
      reason: canCreate ? 'Sufficient memory available' : `Insufficient memory. Available: ${memoryInfo.free}MB, Required: ${this.minMemoryThreshold}MB`
    };
  }

  /**
   * Get system CPU information
   * @returns {Object} CPU information
   */
  getCpuInfo() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    return {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      loadAverage: {
        '1min': Math.round(loadAvg[0] * 100) / 100,
        '5min': Math.round(loadAvg[1] * 100) / 100,
        '15min': Math.round(loadAvg[2] * 100) / 100
      }
    };
  }

  /**
   * Get comprehensive system information
   * @returns {Object} Complete system status
   */
  getSystemStatus() {
    const memoryInfo = this.getMemoryInfo();
    const cpuInfo = this.getCpuInfo();
    const uptime = os.uptime();
    
    return {
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: Math.round(uptime),
      uptimeFormatted: this.formatUptime(uptime),
      memory: memoryInfo,
      cpu: cpuInfo,
      canCreateNewSession: memoryInfo.free >= this.minMemoryThreshold,
      memoryStatus: this.getMemoryStatus(memoryInfo.usagePercent)
    };
  }

  /**
   * Format uptime in human readable format
   * @param {number} seconds 
   * @returns {string} Formatted uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get memory status based on usage percentage
   * @param {number} usagePercent 
   * @returns {string} Status level
   */
  getMemoryStatus(usagePercent) {
    if (usagePercent >= 90) return 'critical';
    if (usagePercent >= 80) return 'warning';
    if (usagePercent >= 70) return 'moderate';
    return 'good';
  }

  /**
   * Set minimum memory threshold
   * @param {number} thresholdMB Threshold in MB
   */
  setMinMemoryThreshold(thresholdMB) {
    this.minMemoryThreshold = thresholdMB;
    logger.info(`Memory threshold updated to ${thresholdMB}MB`);
  }

  /**
   * Get current minimum memory threshold
   * @returns {number} Threshold in MB
   */
  getMinMemoryThreshold() {
    return this.minMemoryThreshold;
  }
}

// Create singleton instance
const systemMonitor = new SystemMonitor();

module.exports = systemMonitor;