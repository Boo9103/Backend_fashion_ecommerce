const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

// GET /public/home-meta?limit=50
router.get('/home-meta', publicController.getHomeMeta);

// GET /public/home-products?type=all|supplier|flash|newest&suppliers=id1,id2&limit=8&page=1
router.get('/home-products', publicController.getHomeProducts);

module.exports = router;

//lấy sp
// Supplier group: GET /public/home-products?type=supplier&suppliers=id1,id2&limit=8&page=1
// Flash sale: GET /public/home-products?type=flash&limit=8&page=1
// Newest: GET /public/home-products?type=newest&limit=12&page=1
// All groups: GET /public/home-products?type=all&limit=8&page=1