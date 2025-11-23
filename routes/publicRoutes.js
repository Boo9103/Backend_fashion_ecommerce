const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

// GET /public/home-meta?limit=50
router.get('/home-meta', publicController.getHomeMeta);

// GET /public/home-products?type=all|supplier|flash|newest&suppliers=id1,id2&limit=8&page=1
router.get('/home-products', publicController.getHomeProducts);
router.get('/products', publicController.getProductsSimple); // lấy sp hiển thị ở trang home
router.get('/reviews/:productId', publicController.listReviewsByProductId);
router.get('/products/:id', publicController.getProductById);

router.get('/categories-with-products', publicController.getCategoriesWithProducts);

//news
router.get('/news', publicController.getNewList);
router.get('/news/:id', publicController.getNewsById);

module.exports = router;

//lấy sp supplier dùng offset pagination (page, limit)
// Supplier group: GET http://localhost:3000/public/home-products?type=supplier&suppliers=f561e254-2c00-44f9-bd01-b851beec9b06&limit=5&page=1
// Flash sale: GET /public/home-products?type=flash&limit=8&cursor=xxx, (lần đầu k cần truyền), sau lần đầu có nextCursor = Y, gắn y = xxx cho lần thứ 2 trở đi
//respone -->
//         "total": 4,
//         "perPage": 2,
//         "nextCursor": null,
//         "hasMore": false (nếu hết sp thì nó là false)
// Newest: GET /public/home-products?type=newest ... tương tự flash sale dùng cursor
//có thể thêm order để sắp xếp asc|desc theo sequence_id
// All groups: GET /public/home-products?type=all&limit=8&page=1

//http://localhost:3000/public/products?limit=10&category_id=c35916a1-387f-4ae8-85c9-0ca9eef95995
//lấy theo cate con đây nhe, ceteid truyền vào là catecha á, có thể truyền cate con nữa nhe
