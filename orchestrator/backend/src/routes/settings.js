const express = require('express');
const { getDatabase } = require('../db');
const { logger } = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);
// Settings management is admin-only
router.use(requireAdmin);

// GET all settings
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query('SELECT * FROM settings');
    
    const settingsObj = {};
    result.rows.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    res.json(settingsObj);
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET setting by key
router.get('/:key', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query('SELECT * FROM settings WHERE key = $1', [req.params.key]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    const setting = result.rows[0];
    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    logger.error('Error fetching setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE setting
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    
    const db = getDatabase();
    
    await db.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
    `, [req.params.key, value.toString()]);
    
    logger.info(`Setting updated: ${req.params.key} = ${value}`);
    res.json({ key: req.params.key, value: value.toString() });
  } catch (error) {
    logger.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE setting
router.delete('/:key', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query('DELETE FROM settings WHERE key = $1', [req.params.key]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    logger.info(`Setting deleted: ${req.params.key}`);
    res.json({ message: 'Setting deleted successfully' });
  } catch (error) {
    logger.error('Error deleting setting:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;