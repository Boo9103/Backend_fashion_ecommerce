const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminCategoryController = require('../controllers/categories/adminCategoryController');
const adminSupplierController = require('../controllers/suppliers/adminSupplierController');
const adminProductController = require('../controllers/products/adminProductController');
const adminPromotionController = require('../controllers/promotions/adminPromotionController');
const authMiddleware = require('../middleware/authMiddleware');

//Category management
router.get('/categories', adminCategoryController.getCategories);
router.post('/categories', adminCategoryController.createCategory);
router.put('/categories/:id', adminCategoryController.updateCategory);
router.delete('/categories/:id', adminCategoryController.deleteCategory);

//Supplier management
router.post('/suppliers', adminSupplierController.createSupplier);
router.put('/suppliers/:id', adminSupplierController.updateSupplier);
router.delete('/suppliers/:id', adminSupplierController.deleteSupplier);
router.get('/suppliers', adminSupplierController.getSupplier);
router.get('/suppliers/:id', adminSupplierController.getSupplierById);

//Vd: http://localhost:3000/admin/categories/6ce72005-09aa-48fd-aa35-03cefb4cf849?cascade=true (delete), nếu k có cascade = true thì mặc định là false,
//thì khi xóa sẽ bảo có node con k xóa được, còn khi set cascade = true thì xóa được

//User management
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:userId', adminController.updateUser);
router.post('/users/:userId/deactivate', adminController.deactiveUser);
router.post('/users/:userId/restore', adminController.restoreUser);
router.delete('/users/:userId/delete', adminController.hardDeleteUser);

//Product management
router.get('/products', adminProductController.getFlashSaleProducts);
router.post('/products', adminProductController.createProduct);
router.get('/products/:id', adminProductController.getProductById);
router.patch('/products/:id', adminProductController.updateFlashSale);
router.put('/products/:id', adminProductController.updateProduct);
router.delete('/products/:id', adminProductController.deleteProduct);
//vd lọc theo giá:http://localhost:3000/admin/products?flash_sale=true&min_price=200000&max_price=500000


//Promotion management
router.post('/promotions', adminPromotionController.createPromotion);
router.get('/promotions', adminPromotionController.getPromotions);
router.get('/promotions/:id', adminPromotionController.getPromotionById);
router.put('/promotions/:id', adminPromotionController.updatePromotion);
router.delete('/promotions/:id', adminPromotionController.deletePromotion);
router.patch('/promotions/:id/status', adminPromotionController.updatePromotionStatus);
module.exports = router;