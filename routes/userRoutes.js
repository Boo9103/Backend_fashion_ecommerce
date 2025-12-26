const express = require('express');
const router = express.Router();
const userController = require('../controllers/users/userController');
const orderController = require('../controllers/orders/orderController');
const promotionController = require('../controllers/promotions/promotionController');
const cartController = require('../controllers/cart/cartController');
const favoriteController = require('../controllers/favorite/favoriteController');
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
router.post('/promotions/preview', requireUser, promotionController.preview); // user chọn mã km để xem chi tiết trước khi lưu vào user_promotion

//user-promotions
router.get('/user-promotions', requireUser, promotionController.getUserPromotions);

//cart
router.get('/cart', requireUser, cartController.getCart);
router.post('/cart/items', requireUser, cartController.addItem);
router.patch('/cart/items/:id', requireUser, cartController.updateItem);
router.delete('/cart/items/:id', requireUser, cartController.removeItem);
router.delete('/cart/clear', requireUser, cartController.clearCart);
// /api/cart/stock/check?variant_ids=id1,id2,id3 -> Check stock availability for one or more variants
router.post('/cart/stock/check', requireUser, cartController.checkStock);
router.delete('/cart/remove-invalid', requireUser, cartController.removeInvalidItems);

//chi tiết product từ variant trong giỏ hàng
router.get('/products/detail/:variantId', cartController.getProductFromVariant);

//reviews
router.post('/orders/:orderId/reviews', requireUser, orderController.addReview);
router.get('/reviews/check', requireUser, orderController.checkReviewed);
router.get('/reviews/:id', requireUser, orderController.getReviewById);
router.patch('/reviews/:id', requireUser, orderController.editReview);
router.delete('/reviews/:id', requireUser, orderController.deleteReview);
//GET /api/user/reviews/check?productId=<product_uuid>


//user-reviews
router.get('/reviewsbyuser', requireUser, orderController.getUserReviews);

//favorites
router.post('/favorites', requireUser, favoriteController.addFavorite);
router.delete('/favorites/:productId', requireUser, favoriteController.removeFavorite);
router.get('/favorites/productIds', requireUser, favoriteController.getListIdsFavorite);
router.get('/favorites/:productId/check', requireUser, favoriteController.checkFavorite);
router.get('/favorites/list', requireUser, favoriteController.getListFavorite);


//measurment
router.get('/measurements', requireUser, userController.getUserMeasurement);
router.put('/measurements', requireUser, userController.updateUserMeasurement);
module.exports = router;



//create order
// {
//   "shipping_address_snapshot": {
//     "full_name": "Nguyễn Văn A",
//     "phone": "0987654321",
//     "address": "123 Võ Thị Sáu, Phường 6, Quận 3, TP.HCM"
//   },
//   "payment_method": "cod",
//   "items": [
//     { "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684", "quantity": 1, "size": "M" },
//     { "variant_id": "050e9020-4e08-4493-a987-6f62bd3f7adc", "quantity": 2, "size": "L" },
//     { "variant_id": "8b0e65b4-3de9-4fd7-a3b8-eb45f598d41a", "quantity": 4, "size": "L"}
//   ],
//   "promotion_code": "FLASH2025",
//   "shipping_fee": 30000
// }
//response:
// {
//     "message": "Order created successfully",
//     "order": {
//         "order_id": "ab7ff395-0096-4927-a5e5-5dd1a8838087",
//         "total_amount": 2893000,
//         "discount_amount": 500000,
//         "shipping_fee": 30000,
//         "final_amount": 2423000,
//         "payment_status": "unpaid",
//         "order_status": "pending",
//         "items": [
//             {
//                 "variant_id": "8b0e65b4-3de9-4fd7-a3b8-eb45f598d41a",
//                 "qty": 4,
//                 "unit_price": "399000.00",
//                 "final_price": 330040.44,
//                 "promo_applied": true,
//                 "name_snapshot": "Áo Polo Xanh Navy",
//                 "color_snapshot": "Xanh Navy",
//                 "size_snapshot": "L"
//             },
//             {
//                 "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684",
//                 "qty": 1,
//                 "unit_price": "899000.00",
//                 "final_price": 743624.96,
//                 "promo_applied": true,
//                 "name_snapshot": "Quần Jean Ống Suông",
//                 "color_snapshot": "Đen",
//                 "size_snapshot": "M"
//             },
//             {
//                 "variant_id": "050e9020-4e08-4493-a987-6f62bd3f7adc",
//                 "qty": 2,
//                 "unit_price": "199000.00",
//                 "final_price": 164606.64,
//                 "promo_applied": true,
//                 "name_snapshot": "Áo Thun Flash Sale",
//                 "color_snapshot": "Trắng",
//                 "size_snapshot": "L"
//             }
//         ]
//     }
// }


//get: http://localhost:3000/user/orders?07e961f5-8001-4c42-9e2e-09f7513f356b?page=1?limit=10
//http://localhost:3000/user/orders?07e961f5-8001-4c42-9e2e-09f7513f356b?from=2025-10-14?to=2025-12-14?page=1?limit=10

//get by id: http://localhost:3000/user/orders/931718f6-1ba1-499e-9f48-44bf4cef13fe
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
//   "qty": 1,
//   "size": "M"
// }
//update -->http://localhost:3000/user/cart/items/eefe9cf1-0f78-4d7d-9245-fb7a96d4b3fe
//->eefe9cf1-0f78-4d7d-9245-fb7a96d4b3fe là cart_item id (cột id trong bảng cart_items)
//clear sẽ xóa items trong giỏ hàng còn cart vẫn giữ nguyên

//lấy chi tiết từ variant
//http://localhost:3000/user/products/detail/050e9020-4e08-4493-a987-6f62bd3f7adc 
// phần cart đã test xong



//reviews 
//post review
// {
//   "reviews": [
//     {
//       "variant_id": "050e9020-4e08-4493-a987-6f62bd3f7adc",
//       "rating": 5,
//       "comment": "Áo rất đẹp, giao nhanh",
//       "images": ["https://.../img1.jpg", "https://.../img2.jpg"]
//     },
//     {
//       "product_id": "16946115-7ed9-48d2-b38d-5a5441bd7b77",
//       "rating": 4,
//       "comment": "Quần ok",
//       "images": []
//     }
//   ]
// }

//--> respone: 
// {
//     "message": "Reviews added successfully",
//     "inserted": 2,
//     "reviews": [
//         {
//             "id": "156caccb-6b0e-4035-bb9a-069f31b5df55",
//             "user_id": "07e961f5-8001-4c42-9e2e-09f7513f356b",
//             "product_id": "3432a738-5409-482a-9016-ee117f20f6d4",
//             "rating": 5,
//             "comment": "Áo rất đẹp, giao nhanh",
//             "created_at": "2025-11-14T07:00:16.068Z",
//             "images": [
//                 "https://.../img1.jpg",
//                 "https://.../img2.jpg"
//             ]
//         },
//         {
//             "id": "1ee41a26-6c2c-43c8-ab94-7a8d5f21ff97",
//             "user_id": "07e961f5-8001-4c42-9e2e-09f7513f356b",
//             "product_id": "16946115-7ed9-48d2-b38d-5a5441bd7b77",
//             "rating": 4,
//             "comment": "Quần ok",
//             "created_at": "2025-11-14T07:00:16.068Z",
//             "images": []
//         }
//     ]
// }

//update reivew: 
// {
//   "rating": 4,
//   "comment": "Mình nhận hàng hàng nhưng giao sai mẫu sau đó shop đã hổ trợ đổi rất nhiệt tình."
// }
// respone: 
// {
//     "message": "Review updated",
//     "review": {
//         "id": "156caccb-6b0e-4035-bb9a-069f31b5df55",
//         "user_id": "07e961f5-8001-4c42-9e2e-09f7513f356b",
//         "product_id": "3432a738-5409-482a-9016-ee117f20f6d4",
//         "rating": 4,
//         "comment": "Mình nhận hàng hàng nhưng giao sai mẫu sau đó shop đã hổ trợ đổi rất nhiệt tình.",
//         "images": [
//             "https://.../img1.jpg",
//             "https://.../img2.jpg"
//         ],
//         "created_at": "2025-11-14T07:00:16.068Z"
//     }
// }


//preview promotion
// {
//     "items": [
//       { "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684", "quantity": 1, "unit_price": 899000 },
//       { "variant_id": "cea6a951-6e75-4b85-9c3b-02443473e23b", "quantity": 2, "unit_price": 194350 }
//     ],
//     "shipping_fee": 35000,
//     "promotion_code": "WINTER2025"
//   }

//respone: 
// {
//     "valid": true,
//     "promotion": {
//         "id": "c236bb28-d919-4ffb-bfdf-9538c623635c",
//         "code": "WINTER2025",
//         "type": "percentage",
//         "value": 20,
//         "max_discount_value": "50000.00"
//     },
//     "subtotal": [
//         {
//             "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684",
//             "qty": 1,
//             "unit_price": 899000,
//             "line_base": 899000
//         },
//         {
//             "variant_id": "cea6a951-6e75-4b85-9c3b-02443473e23b",
//             "qty": 2,
//             "unit_price": 194350,
//             "line_base": 388700
//         }
//     ],
//     "shipping_fee": 35000,
//     "discount": 50000,
//     "discount_breakdown": [
//         {
//             "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684",
//             "qty": 1,
//             "line_base": 899000,
//             "discount": 34907.2
//         },
//         {
//             "variant_id": "cea6a951-6e75-4b85-9c3b-02443473e23b",
//             "qty": 2,
//             "line_base": 388700,
//             "discount": 15092.8
//         }
//     ],
//     "items": [
//         {
//             "variant_id": "3dd1a91f-14ef-44a7-a1d8-7f40f2770684",
//             "qty": 1,
//             "unit_price": 899000,
//             "line_base": 899000,
//             "discount": 34907.2,
//             "final_line": 864092.8
//         },
//         {
//             "variant_id": "cea6a951-6e75-4b85-9c3b-02443473e23b",
//             "qty": 2,
//             "unit_price": 194350,
//             "line_base": 388700,
//             "discount": 15092.8,
//             "final_line": 373607.2
//         }
//     ],
//     "final_total": 1272700
// }