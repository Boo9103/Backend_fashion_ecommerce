const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/categories', authMiddleware, adminController.getCategories);
router.post('/categories', authMiddleware, adminController.createCategory);

router.post('/suppliers', authMiddleware, adminController.createSupplier);

module.exports = router;