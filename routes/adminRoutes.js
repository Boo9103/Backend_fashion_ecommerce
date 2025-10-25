const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminCategoryController = require('../controllers/categories/adminCategoryController');
const adminSupplierController = require('../controllers/suppliers/adminSupplierController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/categories', authMiddleware, adminCategoryController.getCategories);
router.post('/categories', authMiddleware, adminCategoryController.createCategory);

router.post('/suppliers', authMiddleware, adminSupplierController.createSupplier);

//User management
//http://localhost:3000/admin/users?role=customer&status=active -> api mẫu get users
router.get('/users', authMiddleware, adminController.getUsers);
router.post('/users', authMiddleware, adminController.createUser);
//http://localhost:3000/admin/users/07e961f5-8001-4c42-9e2e-09f7513f356b -> api mẫu update user
router.put('/users/:userId', authMiddleware, adminController.updateUser);
router.post('/users/:userId/deactivate', authMiddleware, adminController.deactiveUser);
router.post('/users/:userId/restore', authMiddleware, adminController.restoreUser);
router.delete('/users/:userId/delete', authMiddleware, adminController.hardDeleteUser);
module.exports = router;