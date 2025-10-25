const pool = require ('../../config/db');
const categoryService = require('../../services/categoryService');

exports.getCategories = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT id, name, parent_id, image FROM categories');
    return res.status(200).json({ categories: result.rows });
  } catch (error) {
    console.error('getCategories error:', error);
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  } finally {
    if (client) client.release();
  }
};

exports.createCategory = async (req, res) => {
  try {
    const categoryData = req.body;
    const newCategory = await categoryService.createCategory(categoryData);
    return res.status(201).json({ message: 'Category created successfully', category: newCategory });
  } catch (error) {
    console.error('createCategory error:', error);
    if (error.message === 'Name is required' || error.message === 'Invalid parent_id') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};