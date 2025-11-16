const pool = require('../config/db');
const { client: paypalClient, sdk: paypalSdk } = require('../config/paypal');

exports.createPaypalOrder = async ({ orderId, amount, currency = 'VND', returnUrl, cancelUrl, userId }) => {
  // Validate order ownership / final amount BEFORE calling PayPal outside this function.
  const request = new paypalSdk.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  const usdAmount = (amount / 23000).toFixed(2); // Convert VND to USD assuming 1 USD = 23000 VND
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value: usdAmount } }],
    application_context: { return_url: returnUrl, cancel_url: cancelUrl }
  });

  const resp = await paypalClient.execute(request);
  const paypalOrderId = resp.result.id;

  // persist payment init
  const q = `INSERT INTO payments (id, order_id, gateway, amount, currency, status, created_at, updated_at, gateway_tx_id, raw_response)
             VALUES (public.uuid_generate_v4(), $1, 'paypal', $2, $3, 'init', NOW(), NOW(), $4, $5)
             RETURNING id, gateway_tx_id`;
  const params = [orderId, amount, currency, paypalOrderId, JSON.stringify(resp.result)];
  await pool.query(q, params);

  return { paypalOrderId, links: resp.result.links || [], raw: resp.result };
};

exports.capturePaypalOrder = async ({ orderId, paypalOrderId, userId }) => {
  // call capture
  const req = new paypalSdk.orders.OrdersCaptureRequest(paypalOrderId);
  req.requestBody({});
  const resp = await paypalClient.execute(req);

  const capture = resp.result.purchase_units?.[0]?.payments?.captures?.[0] || null;
  const txId = capture?.id || resp.result.id;
  const payer = resp.result.payer || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // idempotent: if payment already succeeded for this gateway_tx_id, skip
    const existsQ = `SELECT id, status FROM payments WHERE order_id = $1 AND gateway_tx_id = $2 LIMIT 1`;
    const { rows: exRows } = await client.query(existsQ, [orderId, paypalOrderId]);
    if (exRows[0] && exRows[0].status === 'succeeded') {
      await client.query('COMMIT');
      return { alreadyProcessed: true, capture: resp.result };
    }

    // update payment row
    const upQ = `UPDATE payments SET status = $1, paid_at = NOW(), gateway_tx_id = $2, payer_id = $3, payer_email = $4, raw_response = $5, updated_at = NOW()
                 WHERE order_id = $6 AND (gateway_tx_id = $7 OR gateway = 'paypal')
                 RETURNING id`;
    const upParams = [
      'succeeded',
      txId,
      payer?.payer_id || null,
      payer?.email_address || null,
      JSON.stringify(resp.result),
      orderId,
      paypalOrderId
    ];
    await client.query(upQ, upParams);

    // update order status atomically
    const orderUpdateQ = `UPDATE orders SET payment_status = 'paid', order_status = 'confirmed', updated_at = NOW() WHERE id = $1`;
    await client.query(orderUpdateQ, [orderId]);

    await client.query('COMMIT');
    return { success: true, capture: resp.result };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.recordPaypalWebhook = async ({ paypalOrderId, rawEvent }) => {
  // optional helper: find order by gateway_tx_id and update similarly idempotently
  // implement as needed
};