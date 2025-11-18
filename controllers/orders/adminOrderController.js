const orderService = require('../../services/orderService');
const emailer = require('../../config/email'); 
const fs = require('fs');

exports.updateOrderStatus = async (req, res, next) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const orderId = req.params.id;
  const { status, cancel_reason } = req.body;

  try {
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Only admin can update status' });
    }

    const updatedOrder = await orderService.updateOrderStatus({
      userId,
      role,
      orderId,
      status,
      cancel_reason
    });

    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    return res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    if (error.message.includes('Invalid status')) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};