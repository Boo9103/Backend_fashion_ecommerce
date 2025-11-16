const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments/paymentsController');
const auth = require('../middleware/authMiddleware');

router.post('/paypal/create', auth.requireUser, paymentsController.createPaypal);
router.post('/paypal/capture', auth.requireUser, paymentsController.capturePaypal);
// webhook should be public endpoint
router.post('/paypal/webhook', express.json({ type: '*/*' }), paymentsController.paypalWebhook);

module.exports = router;