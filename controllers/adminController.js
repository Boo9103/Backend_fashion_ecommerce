const pool = require('../config/db');
const categoryService = require('../services/categoryService');
const supplierService = require('../services/supplierService');

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

exports.createSupplier = async (req, res) => {
  console.log('createSupplier - req.body =', req.body);
  try {
    const supplierData = req.body;
    const newSupplier = await supplierService.createSupplier(supplierData);
    return res.status(201).json({ message: 'Supplier created successfully', supplier: newSupplier });
  } catch (error) {
    console.error('createSupplier error:', error && error.stack ? error.stack : error);
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? (error && error.message) : {}
    });
  }
};