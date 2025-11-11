const pool = require('../config/db');
const validator = require('validator');
// const categoryService = require('../services/categoryService');
// const supplierService = require('../services/supplierService');
const adminService = require('../services/adminService');

// exports.getCategories = async (req, res) => {
//   let client;
//   try {
//     client = await pool.connect();
//     const result = await client.query('SELECT id, name, parent_id, image FROM categories');
//     return res.status(200).json({ categories: result.rows });
//   } catch (error) {
//     console.error('getCategories error:', error);
//     return res.status(500).json({
//       message: 'Server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : {}
//     });
//   } finally {
//     if (client) client.release();
//   }
// };

// exports.createCategory = async (req, res) => {
//   try {
//     const categoryData = req.body;
//     const newCategory = await categoryService.createCategory(categoryData);
//     return res.status(201).json({ message: 'Category created successfully', category: newCategory });
//   } catch (error) {
//     console.error('createCategory error:', error);
//     if (error.message === 'Name is required' || error.message === 'Invalid parent_id') {
//       return res.status(400).json({ message: error.message });
//     }
//     return res.status(500).json({
//       message: 'Server error',
//       error: process.env.NODE_ENV === 'development' ? error.message : {}
//     });
//   }
// };

// exports.createSupplier = async (req, res) => {
//   console.log('createSupplier - req.body =', req.body);
//   try {
//     const supplierData = req.body;
//     const newSupplier = await supplierService.createSupplier(supplierData);
//     return res.status(201).json({ message: 'Supplier created successfully', supplier: newSupplier });
//   } catch (error) {
//     console.error('createSupplier error:', error && error.stack ? error.stack : error);
//     return res.status(500).json({
//       message: 'Server error',
//       error: process.env.NODE_ENV === 'development' ? (error && error.message) : {}
//     });
//   }
// };

exports.getUsers = async (req, res)=> {
  const { role, status } = req.body || {};
  try {
    const users = await adminService.getUsers(role, status);
    res.status(200).json({ users, timestamp: new Date()});
  }catch (error){
    res.status(500).json({ error: 'Server error'});
  }
};

exports.deactiveUser = async (req, res)=> {
  console.log('deactiveUser - params:', req.params);
  console.log('deactiveUser - user from token:', req.user);
  const { userId } = req.params;
  try {
    const deactivatedUser = await adminService.deactiveUser(userId);
    res.status(200).json({ message: 'User deactivated successfully', user: deactivatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// exports.deactiveUser = async (req, res)=> {
//   console.log('deactiveUser - params:', req.params);
//   console.log('deactiveUser - user from token:', req.user);

//   const { userId } = req.params;

//   if (!req.user) return res.status(401).json({ message: 'Unauthorized: missing token' });

//   const uuidRegex = /^[0-9a-fA-F-]{36}$/;
//   if (!uuidRegex.test(userId)) {
//     return res.status(400).json({ message: 'Invalid userId' });
//   }

//   try {
//     const deactivatedUser = await adminService.deactiveUser(userId);
//     if (!deactivatedUser) return res.status(404).json({ message: 'User not found' });
//     return res.status(200).json({ message: 'User deactivated successfully', user: deactivatedUser });
//   } catch (error) {
//     // Print full stack for debugging
//     console.error('deactiveUser error:', error && error.stack ? error.stack : error);
//     // Return more info in development only
//     return res.status(500).json({
//       error: process.env.NODE_ENV === 'development' ? (error && error.message) : 'Server error'
//     });
//   }
// };
  
exports.restoreUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const restoredUser = await adminService.restoreUser(userId);
    res.status(200).json({ message: 'User restored successfully', user: restoredUser });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

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

exports.hardDeleteUser = async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  try {
    const deleteUser = await adminService.hardDeleteUser(userId);
    return res.status(200).json({ message: 'User deleted successfully', deletedId: deleteUser.id, reason });
  }
  catch (error) {
    console.error('hardDeleteUser error:', error);
    return res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : {} });
  }
};

exports.updateUserEmail = async (req, res) => {
  try {
    //đảm bảo caller là admin
    if(!req.user || req.user.role !== 'admin'){
      return res.status(403).json({ message: 'Forbidden: Admins only' });
    }
    const targetUserId = req.params.id;
    const newEmail = req.body.email;
    const updated = await adminService.updateUserEmail(targetUserId, newEmail);
    return res.json({ user: updated });
  } catch (error) {
    console.error('updateUserEmail error:', error);
    return res.status(500).json({ message: 'Server error', error: process.env.NODE_ENV === 'development' ? error.message : {} });
  }
};