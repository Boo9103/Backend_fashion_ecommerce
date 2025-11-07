const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orders/orderController');
const { authMiddleware, requireUser } = require('../middleware/authMiddleware');

router.post('/orders', requireUser, orderController.createOrder);
router.get('/orders', requireUser, orderController.getOrders);
router.get('/orders/:id', requireUser, orderController.getOrderById);
router.post('/orders/:id/cancel', requireUser, orderController.cancelOrder);
module.exports = router;


//create order
//{
//   "shipping_address_snapshot": {
//     "full_name": "Nguyễn Văn A",
//     "phone": "0987654321",
//     "address": "123 Võ Thị Sáu, Phường 6, Quận 3, TP.HCM"
//   },
//   "payment_method": "cod",
//   "items": [
//     { "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684", "quantity": 1 },
//     { "variant_id": "050e9020-4e08-4493-a987-6f62bd3f7adc", "quantity": 2 },
//     { "variant_id": "8b0e65b4-3de9-4fd7-a3b8-eb45f598d41a", "quantity": 4}
//   ],
//   "promotion_code": "SALE20",
//   "shipping_fee": 30000
// }


//get: http://localhost:3000/user/orders?07e961f5-8001-4c42-9e2e-09f7513f356b?page=1?limit=10
//http://localhost:3000/user/orders?07e961f5-8001-4c42-9e2e-09f7513f356b?from=2025-10-14?to=2025-12-14?page=1?limit=10

//get by it: http://localhost:3000/user/orders/931718f6-1ba1-499e-9f48-44bf4cef13fe
//post cancel: http://localhost:3000/user/orders/931718f6-1ba1-499e-9f48-44bf4cef13fe/cancel