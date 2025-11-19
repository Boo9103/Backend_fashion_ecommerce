const e = require('express');
const orderService = require('../../services/userOrderServices');

exports.createOrder = async(req, res)=> {
    const userId = req.user?.id;
    const {
        shipping_address_snapshot,
        payment_method,
        items,
        promotion_code,
        shipping_fee = 0,
    }  = req.body;

    try {
        const order = await orderService.createOrder({
            user_id: userId,
            shipping_address_snapshot,
            payment_method,
            items,
            promotion_code,
            shipping_fee,
        });

        const orderId = order?.id || order?.order_id || null;

        return res.status(201).json({   
            message: 'Order created successfully',
            order, orderId
        });
    }catch(error){
        if(error.message.includes('Cart is empty') || error.message.includes('Invalid') || error.message.includes('out of stock')){
            return res.status(400).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Server error', error: error.message });
    };

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