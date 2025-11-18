const orderNotificationService = require('../../services/orderNotificationService');
const auth = require('../../middleware/authMiddleware'); // nếu cần dùng trong route

exports.sendDeliveredEmail = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        // kiểm tra quyền (nếu middleware chưa check role)
        if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

        const sent = await orderNotificationService.sendDeliveryEmailIfNeeded(orderId);
        return res.json({ success: true, orderId, sent });
    } catch (err) {
        console.error('[adminNotificationController.sendDeliveredEmail]', err && err.stack ? err.stack : err);
        next(err);
    }
};