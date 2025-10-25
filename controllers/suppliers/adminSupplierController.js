const pool = require('../../config/db');
const supplierService = require('../../services/supplierService');

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