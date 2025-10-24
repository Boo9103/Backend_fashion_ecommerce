const pool = require('../config/db');
const validator = require('validator');
const categoryService = require('../services/categoryService');
const supplierService = require('../services/supplierService');
const adminService = require('../services/adminService');

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

exports.getUsers = async (req, res)=> {
  const { role, status } = req.body || {};
  try {
    const users = await adminService.getUsers(role, status);
    res.status(200).json({ users, timestamp: new Date()});
  }catch (error){
    res.status(500).json({ error: 'Server error'});
  }
};

exports.banUser = async (req, res) => {
  const { userId, action } = req.body;
  try {
    const updatedUser = await adminService.banUser(userId, action);
    res.status(200).json({ message: `User ${action}ed successfully`, user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// exports.banUser = async (req, res) => {
//   try {
//     const { userId, action } = req.body || {};
//     if (!userId || !action) return res.status(400).json({ message: 'userId and action are required' });

//     const allowed = ['ban', 'active'];
//     if (!allowed.includes(action)) return res.status(400).json({ message: 'Invalid action' });

//     // Try known service method names
//     let updatedUser;
//     if (typeof adminService.updateUserStatus === 'function') {
//       updatedUser = await adminService.updateUserStatus(userId, action);
//     } else if (typeof adminService.banUser === 'function') {
//       updatedUser = await adminService.banUser(userId, action);
//     } else {
//       throw new Error('Admin service method not found: expected updateUserStatus or banUser');
//     }

//     if (!updatedUser) return res.status(404).json({ message: 'User not found' });

//     return res.status(200).json({ message: `User ${action}ed successfully`, user: updatedUser });
//   } catch (error) {
//     console.error('banUser error:', error && error.stack ? error.stack : error);
//     return res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? (error && error.message) : {} });
//   }
// };

exports.createUser = async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body || {};

    // Validate input
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Chuẩn bị dữ liệu
    const userData = { email, password, full_name, phone };

    const newUser = await adminService.createUser(userData);
    return res.status(201).json({ message: 'User created', user: newUser });
  } catch (err) {
    console.error('createUser error:', err && err.stack ? err.stack : err);
    if (err.code === '23505') { // PostgreSQL unique violation (email exists)
      return res.status(400).json({ message: 'Email already exists' });
    }
    return res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? err.message : {} });
  }
};

exports.updateUser = async (req, res) => {
  const { userId } = req.params;
  const { full_name, phone, name } = req.body;
  try {
    const updatedUser = await adminService.updateUser(userId, {
      full_name,
      phone,
      name
    });
    return res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('updateUser error:', error);
    if (error.message === 'User not found or cannot be updated') {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

exports.deleteUser = async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }
  try {
    const deletedUser = await adminService.deleteUser(userId);
    res.status(200).json({ message: 'User deleted successfully', user: deletedUser });
  } catch (error) {
    console.error('deleteUser error:', error && error.stack ? error.stack : error);
    res.status(400).json({ error: error.message });
  }
};