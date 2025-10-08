const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://orchestrator:orchestrator123@localhost:5432/orchestrator';
  
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  const client = await pool.connect();
  
  try {
    console.log('Starting user authentication migration...');

    // Check if users table exists
    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!usersTableExists.rows[0].exists) {
      console.log('Creating users table...');
      
      // Create users table
      await client.query(`
        CREATE TABLE users (
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

      // Create default admin user
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

      console.log('Default admin user created');
    }

    // Check if instances table has user_id column
    const instancesUserIdExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'instances' 
        AND column_name = 'user_id'
      );
    `);

    if (!instancesUserIdExists.rows[0].exists) {
      console.log('Adding user_id column to instances table...');
      
      // Get admin user ID
      const adminUser = await client.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
      const adminUserId = adminUser.rows[0].id;

      // Add user_id column to instances
      await client.query('ALTER TABLE instances ADD COLUMN user_id TEXT');
      
      // Set all existing instances to belong to admin
      await client.query('UPDATE instances SET user_id = $1', [adminUserId]);
      
      // Make user_id NOT NULL and add foreign key
      await client.query('ALTER TABLE instances ALTER COLUMN user_id SET NOT NULL');
      await client.query('ALTER TABLE instances ADD CONSTRAINT fk_instances_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');
      
      // Drop the unique constraint on name and add a new one with user_id
      await client.query('ALTER TABLE instances DROP CONSTRAINT IF EXISTS instances_name_key');
      await client.query('ALTER TABLE instances ADD CONSTRAINT instances_name_user_unique UNIQUE (name, user_id)');

      console.log('Instances table updated with user ownership');
    }

    // Check if templates table has user_id column
    const templatesUserIdExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'templates' 
        AND column_name = 'user_id'
      );
    `);

    if (!templatesUserIdExists.rows[0].exists) {
      console.log('Adding user_id column to templates table...');
      
      // Add user_id column to templates (nullable for global templates)
      await client.query('ALTER TABLE templates ADD COLUMN user_id TEXT');
      
      // Add foreign key constraint
      await client.query('ALTER TABLE templates ADD CONSTRAINT fk_templates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');
      
      // Drop the unique constraint on name and add a new one with user_id
      await client.query('ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_name_key');
      await client.query('ALTER TABLE templates ADD CONSTRAINT templates_name_user_unique UNIQUE (name, user_id)');

      console.log('Templates table updated with user ownership');
    }

    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };