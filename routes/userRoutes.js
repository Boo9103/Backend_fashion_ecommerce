const express = require('express');
const router = express.Router();
const userController = require('../controllers/users/userController');
const orderController = require('../controllers/orders/orderController');
const promotionController = require('../controllers/promotions/promotionController');
const cartController = require('../controllers/cart/cartController');
const { authMiddleware, requireUser } = require('../middleware/authMiddleware');

router.post('/orders', requireUser, orderController.createOrder);
router.get('/orders', requireUser, orderController.getOrders);
router.get('/orders/:id', requireUser, orderController.getOrderById);
router.post('/orders/:id/cancel', requireUser, orderController.cancelOrder);

//profile
router.get('/profile', requireUser, userController.getUserById);
router.put('/profile', requireUser, userController.updateUserProfile);
//Hard delte user (chưa test - chưa có tk) - ní test api này đi nhe
router.delete('/profile', requireUser, userController.deleteAccount);

//address
router.get('/addresses', requireUser, userController.getAddresses);
router.post('/addresses', requireUser, userController.addAddress);
router.put('/addresses/:id', requireUser, userController.updateAddress);
router.delete('/addresses/:id', requireUser, userController.deleteAddress);
router.get('/addresses/:id', requireUser, userController.getAddressById);
router.patch('/addresses/:id/set-default', requireUser, userController.setDefaultAddress);

//user: deactive
router.patch('/profile/deactive', requireUser, userController.deactivateAccount);


// Promotions (public)
router.get('/promotions/home',requireUser, promotionController.listForHome);   // trang chủ / widget promotions (public)


//promotions
router.post('/promotions/:id/collect', requireUser, promotionController.collect);
router.get('/promotions/:id', promotionController.getPromotionById); // detail promotion
router.post('/promotions/check-code', requireUser, promotionController.checkCode);//dùng lúc checkout
router.post('/promotions/collect-by-code', requireUser, promotionController.collectByCode);

//user-promotions
router.get('/user-promotions', requireUser, promotionController.getUserPromotions);

//cart
router.get('/cart', requireUser, cartController.getCart);
router.post('/cart/items', requireUser, cartController.addItem);
router.patch('/cart/items/:id', requireUser, cartController.updateItem);
router.delete('/cart/items/:id', requireUser, cartController.removeItem);
router.delete('/cart/clear', requireUser, cartController.clearCart);

//chi tiết product từ variant trong giỏ hàng
router.get('/products/detail/:variantId', cartController.getProductFromVariant);

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

//post address
// {
//   "receive_name": "Nguyen Van A",
//   "phone": "0123456789",
//   "address": "123 ABC St, District 1, HCM",
//   "is_default": true,
//   "tag": "Home"
// }

//get address by id: http://localhost:3000/user/addresses/417b8d65-7b4f-4d1a-85f4-e2acae48f32a

//promotion
//http://localhost:3000/user/promotions/home

//collect
//http://localhost:3000/user/promotions/c236bb28-d919-4ffb-bfdf-9538c623635c/collect
// kq: {
//     "collected": true,
//     "created": true
// }

//collect by code lần 1 oke -> lần 2 trùng báo lỗi -- body {"code": "SUMMER25" }
//http://localhost:3000/user/promotions/collect-by-code


//Check code sử dụng khi checkout cần truyền body { "eligibleSubtotal": 250000 } 
//Th1: no code chỉ truyền { "eligibleSubtotal": 250000 } -> sẽ trả về những promo active và thỏa điều kiện mà user đã collect
//Th2: có code truyền {
//      "code": "WINTER2025",
//      "eligibleSubtotal": 250000
// } -> trả về chi tiết promo nếu thỏa điều kiện -> lấy thông tin trả về của promo này để hiển thị lên fe (đang chọn) mã này không lưu vào db nhé
//th3: {
//     "code": "WINTER2025",
//     "eligibleSubtotal": 250000,
//     "save": true
// } -> tương tự th2 nhưng nếu thỏa điều kiện sẽ lưu mã này vào user_promotion (giống như collect)

//CART
//add items to cart (post)
//{
//   "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684",
//   "qty": 1
// }
//update -->http://localhost:3000/user/cart/items/eefe9cf1-0f78-4d7d-9245-fb7a96d4b3fe
//->eefe9cf1-0f78-4d7d-9245-fb7a96d4b3fe là cart_item id (cột id trong bảng cart_items)
//clear sẽ xóa items trong giỏ hàng còn cart vẫn giữ nguyên

//lấy chi tiết từ variant
//http://localhost:3000/user/products/detail/050e9020-4e08-4493-a987-6f62bd3f7adc 
// phần cart đã test xong