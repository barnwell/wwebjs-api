const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// All user management routes require admin access
router.use(authenticateToken);
router.use(requireAdmin);

// GET /api/users - List all users
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query(`
      SELECT 
        u.id, u.username, u.email, u.role, u.is_active, 
        u.created_at, u.updated_at, u.last_login_at,
        COUNT(i.id) as instance_count
      FROM users u
      LEFT JOIN instances i ON u.id = i.user_id
      GROUP BY u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at
      ORDER BY u.created_at DESC
    `);

    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query(`
      SELECT 
        u.id, u.username, u.email, u.role, u.is_active, 
        u.created_at, u.updated_at, u.last_login_at,
        COUNT(i.id) as instance_count
      FROM users u
      LEFT JOIN instances i ON u.id = i.user_id
      WHERE u.id = $1
      GROUP BY u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users - Create new user
router.post('/', async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Validate role
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Basic password validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const db = getDatabase();
    
    // Check if username or email already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create user
    await db.query(`
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, username, email, hashedPassword, role]);

    const newUser = await db.query(`
      SELECT id, username, email, role, is_active, created_at, updated_at, last_login_at
      FROM users WHERE id = $1
    `, [userId]);

    logger.info(`User created by admin: ${username}`);

    res.status(201).json({
      success: true,
      user: newUser.rows[0]
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const { username, email, password, role, is_active } = req.body;
    const userId = req.params.id;

    const db = getDatabase();
    
    // Check if user exists
    const existingUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = existingUser.rows[0];

    // Prevent admin from deactivating themselves
    if (userId === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Prevent admin from changing their own role
    if (userId === req.user.id && role && role !== user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Check if username or email already exists (excluding current user)
    if (username || email) {
      const duplicateCheck = await db.query(
        'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
        [username || user.username, email || user.email, userId]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
    }

    // Validate role if provided
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Validate password if provided
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Build update query
    let updateQuery = `
      UPDATE users 
      SET username = COALESCE($1, username),
          email = COALESCE($2, email),
          role = COALESCE($3, role),
          is_active = COALESCE($4, is_active),
          updated_at = CURRENT_TIMESTAMP
    `;
    let queryParams = [username, email, role, is_active];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += ', password_hash = $5';
      queryParams.push(hashedPassword);
    }

    updateQuery += ' WHERE id = $' + (queryParams.length + 1) + ' RETURNING id, username, email, role, is_active, created_at, updated_at, last_login_at';
    queryParams.push(userId);

    const result = await db.query(updateQuery, queryParams);
    const updatedUser = result.rows[0];

    logger.info(`User updated by admin: ${updatedUser.username}`);

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const db = getDatabase();
    
    // Check if user exists
    const existingUser = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const username = existingUser.rows[0].username;

    // Delete user (this will cascade delete instances, templates, etc.)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    logger.info(`User deleted by admin: ${username}`);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/instances - Get user's instances
router.get('/:id/instances', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query(`
      SELECT i.*, u.username as owner_username
      FROM instances i
      JOIN users u ON i.user_id = u.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
    `, [req.params.id]);

    // Parse JSON config for each instance
    const instances = result.rows.map(instance => ({
      ...instance,
      config: JSON.parse(instance.config)
    }));

    res.json({
      success: true,
      instances
    });
  } catch (error) {
    logger.error('Error fetching user instances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;