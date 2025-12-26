const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const adminCategoryController = require('../controllers/categories/adminCategoryController');
const adminSupplierController = require('../controllers/suppliers/adminSupplierController');
const adminProductController = require('../controllers/products/adminProductController');
const promotionController = require('../controllers/promotions/adminPromotionController');
const userOrderController = require('../controllers/orders/orderController');
const userController = require('../controllers/users/userController');
const orderNotificationController = require('../controllers/orders/adminNotificationController');
const adminNewsController = require('../controllers/news/adminNewsController');
const adminOrderController = require('../controllers/orders/adminOrderController');
const adminRevenueController = require('../controllers/revenue/adminRevenueController');
const { authMiddleware, requireAdmin, requireUser } = require('../middleware/authMiddleware');

//Category management (admin routes require admin)
router.get('/categories', requireAdmin, adminCategoryController.getCategories);
router.post('/categories', requireAdmin, adminCategoryController.createCategory);
router.put('/categories/:id', requireAdmin, adminCategoryController.updateCategory);
router.delete('/categories/:id', requireAdmin, adminCategoryController.deleteCategory);

//Supplier management
router.post('/suppliers', requireAdmin, adminSupplierController.createSupplier);
router.put('/suppliers/:id', requireAdmin, adminSupplierController.updateSupplier);
router.delete('/suppliers/:id', requireAdmin, adminSupplierController.deleteSupplier);
router.get('/suppliers', requireAdmin, adminSupplierController.getSupplier);
router.get('/suppliers/:id', requireAdmin, adminSupplierController.getSupplierById);

//Vd: http://localhost:3000/admin/categories/6ce72005-09aa-48fd-aa35-03cefb4cf849?cascade=true (delete), nếu k có cascade = true thì mặc định là false,
//thì khi xóa sẽ bảo có node con k xóa được, còn khi set cascade = true thì xóa được

//User management
router.get('/users', requireAdmin, adminController.getUsers);
router.get('/users/:userId', requireAdmin, userController.getUserByInputId);
router.post('/users', requireAdmin, adminController.createUser);
router.put('/users/:userId', requireAdmin, adminController.updateUser);
router.post('/users/:userId/deactivate', requireAdmin, adminController.deactiveUser);
router.post('/users/:userId/restore', requireAdmin, adminController.restoreUser);
router.delete('/users/:userId', requireAdmin, adminController.hardDeleteUser);
router.patch('/users/:id/email', requireAdmin, adminController.updateUserEmail);

//Product management
router.get('/products', requireAdmin, adminProductController.getFlashSaleProducts);
router.post('/products', requireAdmin, adminProductController.createProduct);
router.get('/products/:id', adminProductController.getProductById);
router.patch('/products/:id', requireAdmin, adminProductController.updateFlashSale);
router.put('/products/:id', requireAdmin, adminProductController.updateProduct);
router.delete('/products/:id', requireAdmin, adminProductController.deleteProduct);
//vd lọc theo giá:http://localhost:3000/admin/products?flash_sale=true&min_price=200000&max_price=500000
router.patch('/products/:id/status', requireAdmin, adminProductController.updateProductStatus);

//Promotion management
router.post('/promotions', requireAdmin, promotionController.createPromotion);
router.get('/promotions', requireAdmin, promotionController.getPromotions);
router.get('/promotions/products', requireAdmin, adminProductController.getProductsForPromotion);
//http://localhost:3000/admin/promotions/products?search_key=áo%20thun?status=inactive
//http://localhost:3000/admin/promotions/products?search_key=áo%20thun&category_id=4d6baeee-8417-44d8-ac4b-178d6f45793f&supplier_id=f561e254-2c00-44f9-bd01-b851beec9b06
router.get('/promotions/:id', requireAdmin, promotionController.getPromotionById);
router.put('/promotions/:id', requireAdmin, promotionController.updatePromotion);
router.delete('/promotions/:id', requireAdmin, promotionController.deletePromotion);
router.patch('/promotions/:id/status', requireAdmin, promotionController.updatePromotionStatus);

//Order management
router.get('/orders', requireAdmin, userOrderController.getOrders);
router.get('/orders/:id', requireAdmin, userOrderController.getOrderById);
router.patch('/orders/:id/status', requireAdmin, adminOrderController.updateOrderStatus);

//order notification
router.post('/orders/:id/send-delivered-email', requireAdmin, orderNotificationController.sendDeliveredEmail);

//news
router.post('/news', requireAdmin, adminNewsController.createNews);
router.get('/news', requireAdmin, adminNewsController.listNewsAdmin);
router.get('/news/:id', requireAdmin, adminNewsController.getNewsById);
router.put('/news/:id', requireAdmin, adminNewsController.updateNews);
router.delete('/news/:id', requireAdmin, adminNewsController.removeNews);

//revenue report
router.get('/stats/revenue', requireAdmin, adminRevenueController.revenue); // nếu k truyền s e thì mặc định là 12 tuần gấn nhất
router.get('/stats/top-products', requireAdmin, adminRevenueController.topProducts);

module.exports = router;

//vd get order by id: http://localhost:3000/admin/orders/698dafa5-c7b2-4388-8bd7-36dec041ad82
// patch update order status: http://localhost:3000/admin/orders/931718f6-1ba1-499e-9f48-44bf4cef13fe/status
//{
//   "status": "shipped", admin có thể truyền các trạng thái khác nhau, còn user chỉ cancel
//}