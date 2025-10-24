const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/categories', authMiddleware, adminController.getCategories);
router.post('/categories', authMiddleware, adminController.createCategory);

router.post('/suppliers', authMiddleware, adminController.createSupplier);

//User management
//http://localhost:3000/admin/users?role=customer&status=active -> api mẫu get users
router.get('/users', authMiddleware, adminController.getUsers);
router.post('/users/ban', authMiddleware, adminController.banUser);
router.post('/users', authMiddleware, adminController.createUser);
//http://localhost:3000/admin/users/07e961f5-8001-4c42-9e2e-09f7513f356b -> api mẫu update user
router.put('/users/:userId', authMiddleware, adminController.updateUser);
router.delete('/users/:userId', authMiddleware, adminController.deleteUser);

module.exports = router;