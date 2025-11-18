const pool = require('../config/db');
const email = require('../config/email');

async function buildOrderSummaryHtml(orderId, client) {
    const q = `
      SELECT oi.qty, oi.final_price, oi.name_snapshot, oi.color_snapshot, oi.size_snapshot,
             p.id as product_id,
             (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY COALESCE(pi.position,0) LIMIT 1) as image
      FROM order_items oi
      JOIN product_variants pv ON pv.id = oi.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE oi.order_id = $1
    `;
    const { rows } = await client.query(q, [orderId]);
    if (!rows.length) return '';
    let html = `<table style="width:100%; border-collapse:collapse">`;
    html += `<thead><tr>
      <th style="text-align:left;padding:6px;border-bottom:1px solid #eee">Sản phẩm</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #eee">Đơn giá</th>
      <th style="text-align:center;padding:6px;border-bottom:1px solid #eee">SL</th>
      <th style="text-align:right;padding:6px;border-bottom:1px solid #eee">Tổng</th>
    </tr></thead><tbody>`;
    for (const r of rows) {
      const name = r.name_snapshot || '';
      const color = r.color_snapshot ? ` / ${r.color_snapshot}` : '';
      const size = r.size_snapshot ? ` / ${r.size_snapshot}` : '';
      const lineTotal = (Number(r.final_price || 0) * Number(r.qty || 0)) || 0;
      html += `<tr>
        <td style="padding:8px 6px;border-bottom:1px solid #f5f5f5">${name}${color}${size}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f5f5f5;text-align:right">${Number(r.final_price || 0).toLocaleString('vi-VN')} ₫</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f5f5f5;text-align:center">${r.qty}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #f5f5f5;text-align:right">${lineTotal.toLocaleString('vi-VN')} ₫</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    return html;
}

// Reworked: atomic insert + commit, then send email outside transaction and update notification record
async function sendDeliveryEmailIfNeeded(orderId) {
  const client = await pool.connect();
  let orderDetailsForEmail = null;
  try {
    await client.query('BEGIN');

    // lock order row and read relevant fields
    const oRes = await client.query(
      `SELECT id, user_id, order_status, updated_at, final_amount
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (oRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const order = oRes.rows[0];
    if (order.order_status !== 'delivered') {
      await client.query('ROLLBACK');
      return false;
    }

    // ensure not already handled: try insert notification atomically
    // insert minimal metadata now; ON CONFLICT prevents duplicates
    const ins = await client.query(
      `INSERT INTO order_notifications (order_id, type, metadata)
       VALUES ($1, 'delivered', $2::jsonb)
       ON CONFLICT (order_id, type) DO NOTHING
       RETURNING id`,
      [orderId, JSON.stringify({ state: 'pending', created_by: 'system' })]
    );
    if (ins.rows.length === 0) {
      // another worker already created notification -> nothing to do
      await client.query('ROLLBACK');
      return false;
    }

    // load user info and build order summary while still inside transaction (read-only)
    const uRes = await client.query(
      `SELECT email, COALESCE(full_name, name) AS full_name FROM users WHERE id = $1 LIMIT 1`,
      [order.user_id]
    );
    if (uRes.rows.length === 0 || !uRes.rows[0].email) {
      // no recipient -> rollback and do not send
      await client.query('ROLLBACK');
      return false;
    }
    const user = uRes.rows[0];

    const orderSummaryHtml = await buildOrderSummaryHtml(orderId, client);

    orderDetailsForEmail = {
      id: orderId,
      updated_at: order.updated_at || new Date().toISOString(),
      user_name: user.full_name || '',
      order_summary_html: orderSummaryHtml,
      total_display: Number(order.final_amount || 0).toLocaleString('vi-VN') + ' ₫',
      to: user.email
    };

    // commit so the insert is durable and lock released before external I/O
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    client.release();
    console.error('[orderNotificationService.sendDeliveryEmailIfNeeded] pre-send error', err && err.stack ? err.stack : err);
    throw err;
  } finally {
    // release transaction client if not already released
    try { client.release(); } catch(e){/*ignore*/ }
  }

  // send email outside transaction
  try {
    if (!orderDetailsForEmail) return false;
    await email.sendDeliveredOrderEmail(orderDetailsForEmail.to, orderDetailsForEmail);

    // mark notification as sent
    await pool.query(
      `UPDATE order_notifications
       SET sent_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE order_id = $1 AND type = 'delivered'`,
      [orderId, JSON.stringify({ state: 'sent' })]
    );
    return true;
  } catch (err) {
    // record failure state so we can retry / inspect later
    try {
      await pool.query(
        `UPDATE order_notifications
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE order_id = $1 AND type = 'delivered'`,
        [orderId, JSON.stringify({ state: 'failed', error: String(err.message) })]
      );
    } catch (uErr) {
      console.error('[orderNotificationService.sendDeliveryEmailIfNeeded] failed to update notification metadata', uErr && uErr.stack ? uErr.stack : uErr);
    }
    console.error('[orderNotificationService.sendDeliveryEmailIfNeeded] send email error', err && err.stack ? err.stack : err);
    return false;
  }
}

async function checkAndSendForDeliveredOrders(limit = 50) {
  // find delivered orders that have no notification record
  const client = await pool.connect();
  try {
    const q = `
      SELECT o.id
      FROM orders o
      LEFT JOIN order_notifications n ON n.order_id = o.id AND n.type = 'delivered'
      WHERE o.order_status = 'delivered' AND n.id IS NULL
      ORDER BY o.updated_at DESC
      LIMIT $1
    `;
    const { rows } = await client.query(q, [limit]);
    client.release();

    for (const r of rows) {
      try {
        await sendDeliveryEmailIfNeeded(r.id);
      } catch (e) {
        console.error('[orderNotificationService.checkAndSendForDeliveredOrders] failed for order', r.id, e && e.stack ? e.stack : e);
      }
    }
  } catch (err) {
    client.release();
    throw err;
  }
}

module.exports = { sendDeliveryEmailIfNeeded, checkAndSendForDeliveredOrders };