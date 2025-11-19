const paymentService = require('../../services/paymentService');
const pool = require('../../config/db');

exports.createPaypal = async (req, res, next) => {
  try {
    const { orderId, returnUrl, cancelUrl } = req.body;
    console.log('[createPaypal] inbound params:', { orderId, returnUrl, cancelUrl, userId: req.user?.id });
    // Validate order ownership & compute final_amount from orders table
    const { rows } = await pool.query('SELECT id, final_amount, user_id FROM orders WHERE id = $1', [orderId]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const amount = Number(rows[0].final_amount);
    const r = await paymentService.createPaypalOrder({ orderId, amount, currency: 'VND', returnUrl, cancelUrl, userId: req.user.id });
    return res.json({ paypalOrderId: r.paypalOrderId, links: r.links });
  } catch (err) {
    next(err);
  }
};

exports.capturePaypal = async (req, res, next) => {
  try {
    const { orderId, paypalOrderId } = req.body;
    // validate ownership of order
    const { rows } = await pool.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const r = await paymentService.capturePaypalOrder({ orderId, paypalOrderId, userId: req.user.id });
    return res.json(r);
  } catch (err) {
    next(err);
  }
};

exports.paypalWebhook = async (req, res, next) => {
  try {
    const { sdk } = require('../../config/paypal');
    const paypalClient = require('../../config/paypal').client;
    // Verify webhook signature
    const verifyReq = new sdk.notifications.VerifyWebhookSignatureRequest();
    verifyReq.requestBody({
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_time: req.headers['paypal-transmission-time'],
      cert_url: req.headers['paypal-cert-url'],
      auth_algo: req.headers['paypal-auth-algo'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: req.body
    });
    const vResp = await paypalClient.execute(verifyReq);
    if (vResp.result.verification_status !== 'SUCCESS') {
      return res.status(400).send('invalid webhook signature');
    }

    const event = req.body;
    // process relevant events idempotently
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' || event.event_type === 'CHECKOUT.ORDER.APPROVED') {
      // extract related order id if you store it in payment row (gateway_tx_id -> order mapping)
      const paypalOrderId = event.resource?.id || event.resource?.supplementary_data?.related_ids?.order_id;
      // optional: look up payments table -> find order_id and call capture flow
      // await paymentService.recordPaypalWebhook({ paypalOrderId, rawEvent: event });
    }
    return res.status(200).send('ok');
  } catch (err) {
    next(err);
  }
};