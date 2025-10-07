const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { logger } = require('../utils/logger');

const router = express.Router();

// GET all templates
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query('SELECT * FROM templates ORDER BY is_default DESC, created_at DESC');
    
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
    const db = getDatabase();
    const result = await db.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
    
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
    const { name, description, config, is_default } = req.body;
    
    if (!name || !config) {
      return res.status(400).json({ error: 'Name and config are required' });
    }
    
    const db = getDatabase();
    const id = uuidv4();
    
    // If this is set as default, unset other defaults
    if (is_default) {
      await db.query('UPDATE templates SET is_default = 0');
    }
    
    await db.query(`
      INSERT INTO templates (id, name, description, config, is_default)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, name, description || '', JSON.stringify(config), is_default ? 1 : 0]);
    
    const templateResult = await db.query('SELECT * FROM templates WHERE id = $1', [id]);
    const template = templateResult.rows[0];
    template.config = JSON.parse(template.config);
    template.is_default = Boolean(template.is_default);
    
    logger.info(`Template created: ${name} (${id})`);
    res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE template
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, config, is_default } = req.body;
    const db = getDatabase();
    const result = await db.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
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
    
    const updatedResult = await db.query('SELECT * FROM templates WHERE id = $1', [template.id]);
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
    const db = getDatabase();
    const result = await db.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    await db.query('DELETE FROM templates WHERE id = $1', [template.id]);
    
    logger.info(`Template deleted: ${template.name} (${template.id})`);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;