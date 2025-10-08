const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { generateToken, generateRefreshToken, authenticateToken, requireAdmin } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const db = getDatabase();
        const result = await db.query(
            'SELECT * FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await db.query(
            'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        // Remove password hash from response
        const { password_hash, ...userResponse } = user;

        logger.info(`User logged in: ${user.username}`);

        res.json({
            success: true,
            user: userResponse,
            token,
            refreshToken
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
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

        const newUser = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = newUser.rows[0];

        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        // Remove password hash from response
        const { password_hash, ...userResponse } = user;

        logger.info(`User registered: ${user.username}`);

        res.status(201).json({
            success: true,
            user: userResponse,
            token,
            refreshToken
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');

        const decoded = jwt.verify(refreshToken, JWT_SECRET);

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const db = getDatabase();
        const result = await db.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        const user = result.rows[0];
        const newToken = generateToken(user);
        const newRefreshToken = generateRefreshToken(user);

        res.json({
            success: true,
            token: newToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const { password_hash, ...userResponse } = req.user;
        res.json({
            success: true,
            user: userResponse
        });
    } catch (error) {
        logger.error('Get user info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email, currentPassword, newPassword } = req.body;
        const db = getDatabase();

        // If changing password, verify current password
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ error: 'Current password required to change password' });
            }

            const isValidPassword = await bcrypt.compare(currentPassword, req.user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters long' });
            }
        }

        // Check if username or email already exists (excluding current user)
        if (username || email) {
            const existingUser = await db.query(
                'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
                [username || req.user.username, email || req.user.email, req.user.id]
            );

            if (existingUser.rows.length > 0) {
                return res.status(409).json({ error: 'Username or email already exists' });
            }
        }

        // Update user
        let updateQuery = `
      UPDATE users 
      SET username = COALESCE($1, username),
          email = COALESCE($2, email),
          updated_at = CURRENT_TIMESTAMP
    `;
        let queryParams = [username, email];

        if (newPassword) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            updateQuery += ', password_hash = $3';
            queryParams.push(hashedPassword);
        }

        updateQuery += ' WHERE id = $' + (queryParams.length + 1) + ' RETURNING *';
        queryParams.push(req.user.id);

        const result = await db.query(updateQuery, queryParams);
        const updatedUser = result.rows[0];

        // Remove password hash from response
        const { password_hash, ...userResponse } = updatedUser;

        logger.info(`User profile updated: ${updatedUser.username}`);

        res.json({
            success: true,
            user: userResponse
        });
    } catch (error) {
        logger.error('Profile update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
    // In a more sophisticated setup, you might want to blacklist the token
    logger.info(`User logged out: ${req.user.username}`);
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;