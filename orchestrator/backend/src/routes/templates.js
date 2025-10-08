const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { logger } = require('../utils/logger');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper function to check template ownership
async function checkTemplateOwnership(templateId, userId, userRole) {
  if (userRole === 'admin') {
    return true; // Admins can access all templates
  }
  
  const db = getDatabase();
  const result = await db.query('SELECT user_id FROM templates WHERE id = $1', [templateId]);
  
  if (result.rows.length === 0) {
    return false; // Template doesn't exist
  }
  
  // Global templates (user_id is null) can be accessed by everyone
  // User templates can only be accessed by their owner
  return result.rows[0].user_id === null || result.rows[0].user_id === userId;
}

// GET all templates
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    let query, params;
    
    if (req.user.role === 'admin') {
      // Admins can see all templates with owner information
      query = `
        SELECT t.*, u.username as owner_username
        FROM templates t
        LEFT JOIN users u ON t.user_id = u.id
        ORDER BY t.is_default DESC, t.created_at DESC
      `;
      params = [];
    } else {
      // Regular users can see global templates and their own templates
      query = `
        SELECT t.*, u.username as owner_username
        FROM templates t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.user_id IS NULL OR t.user_id = $1
        ORDER BY t.is_default DESC, t.created_at DESC
      `;
      params = [req.user.id];
    }
    
    const result = await db.query(query, params);
    
    const templates = result.rows.map(template => ({
      ...template,
      config: JSON.parse(template.config),
      is_default: Boolean(template.is_default)
    }));
    
    res.json(templates);
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET template by ID
router.get('/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkTemplateOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const db = getDatabase();
    const result = await db.query(`
      SELECT t.*, u.username as owner_username
      FROM templates t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    template.config = JSON.parse(template.config);
    template.is_default = Boolean(template.is_default);
    
    res.json(template);
  } catch (error) {
    logger.error('Error fetching template:', error);
    res.status(500).json({ error: error.message });
  }
});

// CREATE new template
router.post('/', async (req, res) => {
  try {
    const { name, description, config, is_default, is_global } = req.body;
    
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config are required' });
    }
    
    // Only admins can create global templates
    if (is_global && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create global templates' });
    }
    
    const db = getDatabase();
    const id = uuidv4();
    
    // If this is set as default, unset other defaults
    if (is_default) {
      await db.query('UPDATE templates SET is_default = 0');
    }
    
    // Set user_id to null for global templates, otherwise set to current user
    const userId = is_global ? null : req.user.id;
    
    await db.query(`
      INSERT INTO templates (id, name, description, config, is_default, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, name, description || '', JSON.stringify(config), is_default ? 1 : 0, userId]);
    
    const templateResult = await db.query(`
      SELECT t.*, u.username as owner_username
      FROM templates t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [id]);
    const template = templateResult.rows[0];
    template.config = JSON.parse(template.config);
    template.is_default = Boolean(template.is_default);
    
    logger.info(`Template created: ${name} (${id}) by ${req.user.username}`);
    res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE template
router.patch('/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkTemplateOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { name, description, config, is_default } = req.body;
    const db = getDatabase();
    const result = await db.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Only template owner or admin can modify templates
    if (result.rows[0].user_id && result.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const template = result.rows[0];
    const currentConfig = JSON.parse(template.config);
    const updatedConfig = config ? { ...currentConfig, ...config } : currentConfig;
    
    // If this is set as default, unset other defaults
    if (is_default && !template.is_default) {
      await db.query('UPDATE templates SET is_default = 0');
    }
    
    await db.query(`
      UPDATE templates 
      SET name = $1, description = $2, config = $3, is_default = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [
      name || template.name,
      description !== undefined ? description : template.description,
      JSON.stringify(updatedConfig),
      is_default !== undefined ? (is_default ? 1 : 0) : template.is_default,
      template.id
    ]);
    
    const updatedResult = await db.query(`
      SELECT t.*, u.username as owner_username
      FROM templates t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [template.id]);
    const updatedTemplate = updatedResult.rows[0];
    updatedTemplate.config = JSON.parse(updatedTemplate.config);
    updatedTemplate.is_default = Boolean(updatedTemplate.is_default);
    
    logger.info(`Template updated: ${updatedTemplate.name} (${template.id})`);
    res.json(updatedTemplate);
  } catch (error) {
    logger.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE template
router.delete('/:id', async (req, res) => {
  try {
    // Check ownership
    const hasAccess = await checkTemplateOwnership(req.params.id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const db = getDatabase();
    const result = await db.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    
    // Only template owner or admin can delete templates
    if (template.user_id && template.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await db.query('DELETE FROM templates WHERE id = $1', [template.id]);
    
    logger.info(`Template deleted: ${template.name} (${template.id}) by ${req.user.username}`);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;