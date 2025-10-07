const { Pool } = require('pg');
const { logger } = require('../utils/logger');

let pool = null;

function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://orchestrator:orchestrator123@localhost:5432/orchestrator';
  
  pool = new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  });

  // Test the connection
  return pool.query('SELECT NOW()')
    .then(() => {
      logger.info('PostgreSQL database connected successfully');
      return createTables();
    })
    .catch((error) => {
      logger.error('Failed to connect to PostgreSQL database:', error.message);
      throw error;
    });
}

async function createTables() {
  const client = await pool.connect();
  
  try {
    // Instances table
    await client.query(`
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        port INTEGER UNIQUE NOT NULL,
        container_id TEXT,
        status TEXT DEFAULT 'stopped',
        session_status TEXT DEFAULT 'disconnected',
        config TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_started_at TIMESTAMP,
        last_stopped_at TIMESTAMP
      )
    `);

    // Templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        config TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        instance_id TEXT NOT NULL,
        cpu_usage REAL,
        memory_usage REAL,
        memory_limit REAL,
        network_rx REAL,
        network_tx REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
      )
    `);

    // Create index for metrics queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_instance_timestamp 
      ON metrics(instance_id, timestamp DESC)
    `);

    // Logs table for important events
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        instance_id TEXT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
      )
    `);

    // Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default settings
    await client.query(`
      INSERT INTO settings (key, value) 
      VALUES 
        ('portainer_url', $1),
        ('next_port', $2),
        ('enable_metrics', $3),
        ('metrics_interval', $4)
      ON CONFLICT (key) DO NOTHING
    `, [
      process.env.PORTAINER_URL || 'http://localhost:9000',
      process.env.WWEBJS_PORT_RANGE_START || '3000',
      process.env.ENABLE_METRICS || 'true',
      process.env.METRICS_INTERVAL || '5000'
    ]);

    logger.info('Database tables created/verified successfully');
  } catch (error) {
    logger.error('Error creating database tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

function getDatabase() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

async function closeDatabase() {
  if (pool) {
    try {
      await pool.end();
      logger.info('PostgreSQL database connection pool closed');
    } catch (error) {
      logger.error('Error closing database pool:', error);
    }
    pool = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};

