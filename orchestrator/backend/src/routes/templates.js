const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db');
const { logger } = require('../utils/logger');

const router = express.Router();

// GET all templates
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const templates = db.prepare('SELECT * FROM templates ORDER BY is_default DESC, created_at DESC').all();
    
    const parsedTemplates = templates.map(template => ({
      ...template,
      config: JSON.parse(template.config),
      is_default: Boolean(template.is_default)
    }));
    
    res.json(parsedTemplates);
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET template by ID
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
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
      db.prepare('UPDATE templates SET is_default = 0').run();
    }
    
    db.prepare(`
      INSERT INTO templates (id, name, description, config, is_default)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description || '', JSON.stringify(config), is_default ? 1 : 0);
    
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
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
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const currentConfig = JSON.parse(template.config);
    const updatedConfig = config ? { ...currentConfig, ...config } : currentConfig;
    
    // If this is set as default, unset other defaults
    if (is_default && !template.is_default) {
      db.prepare('UPDATE templates SET is_default = 0').run();
    }
    
    db.prepare(`
      UPDATE templates 
      SET name = ?, description = ?, config = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || template.name,
      description !== undefined ? description : template.description,
      JSON.stringify(updatedConfig),
      is_default !== undefined ? (is_default ? 1 : 0) : template.is_default,
      template.id
    );
    
    const updatedTemplate = db.prepare('SELECT * FROM templates WHERE id = ?').get(template.id);
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
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    db.prepare('DELETE FROM templates WHERE id = ?').run(template.id);
    
    logger.info(`Template deleted: ${template.name} (${template.id})`);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

