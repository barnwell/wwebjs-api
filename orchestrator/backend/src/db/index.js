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
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP
      )
    `);

    // Instances table (updated with user_id and Kubernetes support)
    await client.query(`
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        port INTEGER,
        container_id TEXT,
        deployment_name TEXT,
        status TEXT DEFAULT 'stopped',
        session_status TEXT DEFAULT 'disconnected',
        config TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_started_at TIMESTAMP,
        last_stopped_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(name, user_id)
      )
    `);

    // Add deployment_name column if it doesn't exist (migration)
    await client.query(`
      ALTER TABLE instances 
      ADD COLUMN IF NOT EXISTS deployment_name TEXT
    `);

    // Remove unique constraint on port for Kubernetes mode
    if (process.env.KUBERNETES_MODE === 'true') {
      await client.query(`
        ALTER TABLE instances 
        ALTER COLUMN port DROP NOT NULL
      `);
    }

    // Templates table (updated with user_id)
    await client.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        config TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        user_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(name, user_id)
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

    // Create default admin user if none exists
    const adminCheck = await client.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcrypt');
      const { v4: uuidv4 } = require('uuid');
      
      const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);
      
      await client.query(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        uuidv4(),
        'admin',
        process.env.DEFAULT_ADMIN_EMAIL || 'admin@orchestrator.local',
        hashedPassword,
        'admin'
      ]);
      
      logger.info('Default admin user created');
    }

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

