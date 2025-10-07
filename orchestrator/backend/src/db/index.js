const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

let db = null;

function initDatabase() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/orchestrator.db');
  const dbDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create tables
  createTables();
  
  logger.info(`Database initialized at ${dbPath}`);
  return db;
}

function createTables() {
  // Instances table
  db.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      port INTEGER UNIQUE NOT NULL,
      container_id TEXT,
      status TEXT DEFAULT 'stopped',
      session_status TEXT DEFAULT 'disconnected',
      config TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_started_at DATETIME,
      last_stopped_at DATETIME
    )
  `);

  // Templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      config TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT NOT NULL,
      cpu_usage REAL,
      memory_usage REAL,
      memory_limit REAL,
      network_rx REAL,
      network_tx REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
    )
  `);

  // Create index for metrics queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_instance_timestamp 
    ON metrics(instance_id, timestamp DESC)
  `);

  // Logs table for important events
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  insertSetting.run('portainer_url', process.env.PORTAINER_URL || 'http://localhost:9000');
  insertSetting.run('next_port', process.env.WWEBJS_PORT_RANGE_START || '3000');
  insertSetting.run('enable_metrics', process.env.ENABLE_METRICS || 'true');
  insertSetting.run('metrics_interval', process.env.METRICS_INTERVAL || '5000');
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

module.exports = {
  initDatabase,
  getDatabase
};

