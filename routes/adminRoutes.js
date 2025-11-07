const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminCategoryController = require('../controllers/categories/adminCategoryController');
const adminSupplierController = require('../controllers/suppliers/adminSupplierController');
const adminProductController = require('../controllers/products/adminProductController');
const adminPromotionController = require('../controllers/promotions/adminPromotionController');
const authMiddleware = require('../middleware/authMiddleware');

//Category management
router.get('/categories', authMiddleware, adminCategoryController.getCategories);
router.post('/categories', authMiddleware, adminCategoryController.createCategory);
router.put('/categories/:id', authMiddleware, adminCategoryController.updateCategory);
router.delete('/categories/:id', authMiddleware, adminCategoryController.deleteCategory);

//Supplier management
router.post('/suppliers', authMiddleware, adminSupplierController.createSupplier);
router.put('/suppliers/:id', authMiddleware, adminSupplierController.updateSupplier);
router.delete('/suppliers/:id', authMiddleware, adminSupplierController.deleteSupplier);
router.get('/suppliers', authMiddleware, adminSupplierController.getSupplier);
router.get('/suppliers/:id', authMiddleware, adminSupplierController.getSupplierById);

//Vd: http://localhost:3000/admin/categories/6ce72005-09aa-48fd-aa35-03cefb4cf849?cascade=true (delete), nếu k có cascade = true thì mặc định là false,
//thì khi xóa sẽ bảo có node con k xóa được, còn khi set cascade = true thì xóa được

//User management
router.get('/users', authMiddleware, adminController.getUsers);
router.post('/users', authMiddleware, adminController.createUser);
router.put('/users/:userId', authMiddleware, adminController.updateUser);
router.post('/users/:userId/deactivate', authMiddleware, adminController.deactiveUser);
router.post('/users/:userId/restore', authMiddleware, adminController.restoreUser);
router.delete('/users/:userId/delete', authMiddleware, adminController.hardDeleteUser);

//Product management
router.get('/products', authMiddleware, adminProductController.getFlashSaleProducts);
router.post('/products', authMiddleware, adminProductController.createProduct);
router.get('/products/:id', authMiddleware, adminProductController.getProductById);
router.patch('/products/:id', authMiddleware, adminProductController.updateFlashSale);
router.put('/products/:id', authMiddleware, adminProductController.updateProduct);
router.delete('/products/:id', authMiddleware, adminProductController.deleteProduct);
//vd lọc theo giá:http://localhost:3000/admin/products?flash_sale=true&min_price=200000&max_price=500000


//Promotion management
router.post('/promotions', authMiddleware, adminPromotionController.createPromotion);
router.get('/promotions', authMiddleware, adminPromotionController.getPromotions);
router.get('/promotions/:id', authMiddleware, adminPromotionController.getPromotionById);
router.put('/promotions/:id', authMiddleware, adminPromotionController.updatePromotion);
router.delete('/promotions/:id', authMiddleware, adminPromotionController.deletePromotion);
router.patch('/promotions/:id/status', authMiddleware, adminPromotionController.updatePromotionStatus);
module.exports = router;