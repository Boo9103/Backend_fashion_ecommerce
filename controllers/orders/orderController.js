const e = require('express');
const orderService = require('../../services/userOrderServices');

exports.createOrder = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const itemsCount = Array.isArray(req.body?.items) ? req.body.items.length : 0;
    console.info('[orderController.createOrder] user=%s items=%d payment_method=%s', userId, itemsCount, req.body?.payment_method || 'unknown');
    const order = await orderService.createOrder(userId, req.body);
    
    const orderId = order && (order.id || order.order_id || order.orderId || null);
    if (!orderId) {
      console.error('[orderController.createOrder] order created but missing id');
      return res.status(500).json({ error: 'Order created but missing orderId' });
    }
    return res.status(201).json({ message: 'Order created successfully', orderId, order });
  } catch (err) {
    console.error('[orderController.createOrder] caught error', err && err.stack ? err.stack : err);
    next(err);
  }
};

exports.getOrders = async(req, res)=>{
    const userId =  req.user?.id; // Lấy từ token, có thể null nếu không có token
    const role = req.user?.role; //'customer' | 'admin'
    const { page = 1, limit = 10, status, from, to} = req.query;

    try {
        const orders = await orderService.getOrders({
            userId,
            role,
            page: parseInt(page),
            limit: parseInt(limit),
            status,
            from,
            to
        });

        return res.json({
            message: 'Orders retrieved successfully',
            orders,
            total: orders.total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    }catch(error){
        return res.status(500).json({ error: 'Server error', error: error.message });
    }
};

exports.getOrderById = async(req, res)=>{
    const userId = req.user?.id; // Lấy từ token, có thể null nếu không có token
    const role = req.user?.role; //'customer' | 'admin'
    const orderId = req.params.id;

    try {
        const order = await orderService.getOrderById({ userId, role,  orderId});

        if(!order){
            return res.status(404).json({ error: 'Order not found' });
        }
        return res.json({
            message: 'Order retrieved successfully',
            order
        });
    }catch(error){
        return res.status(500).json({ error: 'Server error', error: error.message });
    }
};

exports.cancelOrder = async(req, res)=>{
    const userId = req.user?.id;
    const role = req.user?.role;
    const orderId = req.params.id;
    const { reason } = req.body;

    try{
        const cancelledOrder = await orderService.cancelOrder({ userId, role, orderId, reason });

        if(!cancelledOrder){
            return res.status(404).json({ error: 'Order not found or access denied' });
        }
        return res.json({
            message: 'Order status updated successfully',
            order: cancelledOrder
        });
    }catch(error){
        if (error.message.includes('Access denied') || error.message.includes('Invalid status')) {
            return res.status(403).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.addReview = async(req, res, next) => {
    try {
        const userId = req.user?.id;
        const orderId = req.params.orderId;
        const reviews = req.body.reviews;
        const inserted = await orderService.addReviewForOrder(userId, orderId, reviews);
        return res.status(201).json({ message: 'Reviews added successfully',
            inserted: inserted.length,
            reviews: inserted
        });
    }catch(error){
        next(error);
    }
};

exports.editReview = async(req, res, next) => {
    try {
        const userId = req.user?.id;
        const reviewId = req.params.id;
        const { rating, comment, images } = req.body || {};
        const updated = await orderService.updateReview(userId, reviewId, { rating, comment, images });
        return res.status(200).json({ message: 'Review updated', review: updated });
    }catch(error){
        next(error);
    }
};

exports.deleteReview = async(req, res, next) => {
    try{
        const userId = req.user?.id;
        const reviewId = req.params.id;
        const r = await orderService.deleteReview(userId, reviewId);
        return res.status(200).json({ message: 'Review deleted successfully', ...r });
        
    }catch(error){
        next(error);
    }
};

exports.getReviewById = async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    const userId = req.user?.id;
    const role = req.user?.role || null;
    const review = await orderService.getReviewById(reviewId, { userId, role });
    return res.json({ review });
  } catch (err) {
    next(err);
  }
};

exports.getUserReviews = async (req, res, next) => {
    try{
        const userId = req.user?.id ;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 20);
        const offset = (page - 1) * limit;
        const reviews = await orderService.getReviewsByUser(userId, { limit, offset });
        return res.json({ success: true, reviews });
    }catch(error){
        next(error);
    }
};

exports.checkReviewed = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        // support query names: productId, product_id, variantId, variant_id
        const productId = req.query.productId || req.query.product_id || null;
        const variantId = req.query.variantId || req.query.variant_id || null;
        if (!productId && !variantId) return res.status(400).json({ success: false, message: 'productId or variantId required' });

        const found = await orderService.findUserReviewForProduct(userId, { productId, variantId });
        if (!found) return res.json({ success: true, reviewed: false, reviewId: null });

        return res.json({ success: true, reviewed: true, reviewId: found.id, productId: found.product_id });
    } catch (err) {
        next(err);
    }
};