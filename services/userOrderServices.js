const pool = require('../config/db');

const promotionService = require('./userPromotionService');


// Chính sách áp voucher: áp cho 1 item đủ điều kiện có line_base cao nhất
const APPLY_POLICY = 'all_eligible_items';
exports.createOrder = async (userId, orderData) => {
  const client = await pool.connect();
  try {
    // debugging: log incoming orderData summary
    console.error('[createOrder] start', { userId, hasOrderData: !!orderData, itemsCount: Array.isArray(orderData?.items) ? orderData.items.length : 0 });

    const items = Array.isArray(orderData.items) ? orderData.items : [];
    // detailed log of items for debug
    console.error('[createOrder] incoming items payload', JSON.stringify(items, null, 2));

    // normalize items ...
    // when validating each item, log and throw clear error
    const itemKeys = [];
    const qtyMap = {};
    const sizeMap = {};
    const perVariantTotal = {};
    const variantIdSet = new Set();

    for (const it of items) {
      if (!it) {
        console.error('[createOrder] invalid item entry (null/undefined)', { userId, item: it, items });
        const e = new Error('Invalid item payload');
        e.status = 400;
        throw e;
      }
      if (!it.variant_id) {
        console.error('[createOrder] missing variant_id in item', { userId, item: it, items });
        const e = new Error('variant_id is required');
        e.status = 400;
        throw e;
      }
      // ...existing normalization logic...
      // (keep the rest of normalization code as-is)
    }

    // after building per-variant totals, log totals for debug
    console.error('[createOrder] perVariantTotal', perVariantTotal);

    // ...existing code to check stock ...
    // before final insert, log computed orderItems
    console.error('[createOrder] computed order items preview', JSON.stringify(itemKeys, null, 2));
    // ...existing code continues...
  } catch (err) {
    console.error('[createOrder] error', err && err.stack ? err.stack : err);
    throw err;
  } finally {
    client.release();
  }
};

function allocateByRatio(items, totalDiscount){
    const subtotal = items.reduce((sum, it) => sum + it.line_base, 0);
    if (subtotal <= 0) return items.map(()=>0);

    // Work in cents to avoid float precision loss, distribute remainder to last item
    const totalCents = Math.round(totalDiscount * 100);
    let usedCents = 0;
    const alloc = [];

    for (let i = 0; i < items.length; i++){
        if (i < items.length - 1){
            const partCents = Math.round((items[i].line_base / subtotal) * totalCents);
            alloc.push(partCents / 100);
            usedCents += partCents;
        } else {
            // last item gets the remainder
            const lastCents = totalCents - usedCents;
            alloc.push(lastCents / 100);
        }
    }
    return alloc;
}

function round2(n){
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

exports.getOrders = async ({ userId, role, page = 1, limit = 20, status, from, to }) => {
    const offset = (page - 1) * limit;
    const params = [];
    let whereClauses = '';

    // 1) Build WHERE + params
    if (role === 'customer' && userId) {
        params.push(userId);
        whereClauses += 'WHERE o.user_id = $1';
    } else if (role === 'admin') {
        if (status) {
        params.push(status);
        whereClauses += whereClauses ? ` AND o.order_status = $${params.length}` : `WHERE o.order_status = $${params.length}`;
        }
        if (from) {
            const f = new Date(from); f.setHours(0,0,0,0);
            params.push(f);
            whereClauses += whereClauses ? ` AND o.created_at >= $${params.length}` : `WHERE o.created_at >= $${params.length}`;
        }
        if (to) {
            const t = new Date(to); t.setHours(23,59,59,999);
            params.push(t);
            whereClauses += whereClauses ? ` AND o.created_at <= $${params.length}` : `WHERE o.created_at <= $${params.length}`;
        }
    }

    // 2) LIMIT/OFFSET
    params.push(limit);
    params.push(offset);
    const limitIdx  = params.length - 1; // vị trí của LIMIT (phần tử áp chót)
    const offsetIdx = params.length;     // vị trí của OFFSET (phần tử cuối)

    // 3) Query chính
    const query = `
        SELECT
            o.id,
            o.user_id,
            o.total_amount,
            o.discount_amount,
            o.shipping_fee,
            o.final_amount,
            o.order_status,
            o.payment_method,
            o.payment_status,
            o.created_at,
            json_agg(oi.*) FILTER (WHERE oi.order_id IS NOT NULL) AS items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ${whereClauses}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `;

    const result = await pool.query(query, params);

    // 4) Count (dùng lại WHERE, bỏ limit/offset)
    const countQuery = `
        SELECT COUNT(*) AS total
        FROM orders o
        ${whereClauses}
    `;
    const countParams = params.slice(0, -2);
    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].total, 10);

    return {
        orders: result.rows,
        total
    };
};

exports.getOrderById = async({ userId, role, orderId})=>{
    const client = await pool.connect();
    try {
        let query = `
            SELECT 
                o.id, 
                o.user_id, 
                o.total_amount,
                o.discount_amount,
                o.shipping_fee,
                o.final_amount,
                o.order_status,
                o.payment_status,
                o.shipping_address_snapshot,
                o.created_at,
                o.updated_at,
                json_agg(oi.*) AS items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.id = $1
        `;
        const params = [orderId];

        if(role === 'customer' && userId){
            params.push(userId);
            query += ' AND o.user_id = $2';
        }else if (role !== 'admin') {
            throw new Error('Access denied');
        }

        query += ' GROUP BY o.id';

        const result = await client.query(query, params);
        if(result.rowCount === 0){
            throw new Error('Order not found');
        }

        return result.rows[0];
    }catch (error){
        throw error;
    }finally{
        client.release();
    }   
};

// Cập nhật trạng thái (chỉ cho Admin)
exports.updateOrderStatus = async ({ userId, role, orderId, status }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra trạng thái hợp lệ
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid order status');
    }

    // Lấy thông tin đơn hàng hiện tại
    const orderCheck = await client.query(
      `SELECT id, user_id, order_status FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderCheck.rowCount === 0) {
      return null;
    }

    if (role !== 'admin') {
      throw new Error('Access denied');
    }

    // Cập nhật trạng thái
    const updateRes = await client.query(
      `UPDATE orders
       SET order_status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, orderId]
    );

    await client.query('COMMIT');

    return updateRes.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.cancelOrder = async ({ userId, role, orderId, reason }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Kiểm tra vai trò
        // role string used elsewhere is 'customer' for normal users
        if (role !== 'customer') {
            throw new Error('Access denied: Only users can cancel orders');
        }

        // Lấy thông tin đơn hàng hiện tại
        const orderCheck = await client.query(
            `SELECT user_id, order_status FROM orders WHERE id = $1`,
            [orderId]
        );

        if (orderCheck.rowCount === 0) {
            return null;
        }

        const currentOrder = orderCheck.rows[0];
        const currentStatus = currentOrder.order_status;

        // Kiểm tra quyền truy cập
        if (currentOrder.user_id !== userId) {
            throw new Error('Access denied');
        }
        if (!['pending', 'confirmed'].includes(currentStatus)) {
            throw new Error('Order can only be cancelled in pending or confirmed status');
        }

        // Hoàn lại stock
        const items = await client.query(
            `SELECT variant_id, qty FROM order_items WHERE order_id = $1`,
            [orderId]
        );
        for (const item of items.rows) {
            await client.query(
                `UPDATE product_variants 
                 SET stock_qty = stock_qty + $1,
                     sold_qty = GREATEST(COALESCE(sold_qty, 0) - $1, 0)
                 WHERE id = $2`,
                [item.qty, item.variant_id]
            );
        }

        // Cập nhật trạng thái
        const updateRes = await client.query(
            `UPDATE orders 
            SET order_status = 'cancelled', updated_at = NOW(), cancel_reason = $2
            WHERE id = $1
            RETURNING id, user_id, order_status, payment_status, created_at, updated_at, cancel_reason`,
            [orderId, reason || null]
        );

        await client.query('COMMIT');

        return updateRes.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.addReviewForOrder = async(userId, orderId, reviews = []) => {
    if(!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    if(!orderId) throw new Error('orderId is required');
    if(!Array.isArray(reviews) || reviews.length === 0) throw new Error('reviews must be a non-empty array');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        //kiểm tra đơn hàng có thuộc về user không và đã giao hàng
        const oRes = await client.query(
            'SELECT id, user_id, order_status FROM orders WHERE id = $1',
            [orderId]
        );
        if(oRes.rowCount === 0) throw new Error('Order not found');
        const order = oRes.rows[0];
        if(order.user_id !== userId) throw new Error('Access denied');
        if(order.order_status !== 'delivered') throw new Error('Order not delivered yet');

        //kiểm tra sản phẩm được đánh giá có thuộc đơn hàng không
        const piRes = await client.query(`
            SELECT oi.variant_id, pv.product_id
            FROM order_items oi
            JOIN product_variants pv ON oi.variant_id = pv.id
            WHERE oi.order_id = $1
        `,[orderId]);

        const variantToProduct = {};
        const productSet = new Set(); // lưu trữ các product_id thuộc đơn hàng
        for(const row of piRes.rows){
            variantToProduct[row.variant_id] = row.product_id;
            productSet.add(row.product_id);
        }

        //kiểm tra và chèn đánh giá
        const normalizedReviews = reviews.map((r, idx) => {
            const rating = Number.isFinite(Number(r.rating)) ? Number(r.rating) : NaN;
            if(!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error(`Invalid rating for review at index ${idx}`);

            let product_id = null;
            if(r.product_id) product_id = r.product_id;
            else if(r.variant_id && variantToProduct[r.variant_id]) product_id = variantToProduct[r.variant_id];
            if(!product_id) throw new Error(`product_id or valid variant_id is required for review at index ${idx}`);

            if(!productSet.has(product_id)) throw new Error(`Product ID ${product_id} in review at index ${idx} not found in order`);

            const comment = r.comment ? String(r.comment).trim() : null;
            const images = Array.isArray(r.images) ? r.images.map(i => String(i).trim()) : [];
            return {
                product_id,
                rating,
                comment,
                images
            };
        });

        // Chèn đánh giá
        const vals = [];
        const params = [];
        let pIdx = 1;
        for(const it of normalizedReviews){
            vals.push(`(public.uuid_generate_v4(), $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
            params.push(userId, it.product_id, it.rating, it.comment);
        }

        const inserRv = `
            INSERT INTO reviews (id, user_id, product_id, rating, comment, created_at)
            VALUES ${vals.join(', ')}
            RETURNING id, user_id, product_id, rating, comment, created_at
            `;
        const insertRes = await client.query(inserRv, params);

        //cập nhật hình ảnh đánh giá
        for(let i = 0; i< normalizedReviews.length; i++){
            const images = normalizedReviews[i].images || [];
            if(images.length > 0) {
                await client.query(`
                    UPDATE reviews SET images = $1 WHERE id = $2`,
                    [JSON.stringify(images), insertRes.rows[i].id]);
                
                //đính kèm hình ảnh vào bản ghi trả về
                insertRes.rows[i].images = images;
            }else{
                insertRes.rows[i].images = [];
            }
        }

        await client.query('COMMIT');
        return insertRes.rows;
    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    }finally {
        client.release();
    }
};

exports.updateReview = async (userId, reviewId,  { rating, comment, images } = {}) => {
    if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    if (!reviewId) throw Object.assign(new Error('reviewId is required'), { status: 400 });

    const client = await pool.connect();
    try{
        await client.query('BEGIN');

        const { rows } = await client.query(`
            SELECT id, user_id, rating, comment,
                COALESCE(images, '[]'::jsonb) AS images
            FROM reviews WHERE id = $1`,[reviewId]);
        
        if(!rows || rows.length === 0){
            throw Object.assign(new Error('Review not found'), { status: 404 });
        }

        const existing = rows[0];
        if(String(existing.user_id) !== String(userId)) throw Object.assign(new Error('Unauthorized'), { status: 403 });

        const newRating = rating !== undefined ? Number(rating) : existing.rating;
        if(newRating !== null && (!Number.isInteger(newRating) || newRating < 1 || newRating > 5)){
            throw Object.assign(new Error('Invalid rating'), { status: 400 });
        }

        const newComment = comment !== undefined ? String(comment).trim() : existing.comment;
        const newImages = images !== undefined ? (Array.isArray(images) ? images : []) : existing.images;

        const updSql = `
            UPDATE reviews 
            SET rating = $1, comment = $2, images = $3
            WHERE id = $4
            RETURNING id, user_id, product_id, rating, comment, images, created_at
            `;
        const updParams = [newRating, newComment, JSON.stringify(newImages), reviewId];
        const updRes = await client.query(updSql, updParams);

        await client.query('COMMIT');
        return updRes.rows[0];
    }catch(error){
        await client.query('ROLLBACK');
        throw error;
    }finally {
        client.release();
    }
};

//Xóa review chỉ cho user xóa review của mình
exports.deleteReview = async ( userId, reviewId ) => {
    if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    if (!reviewId) throw Object.assign(new Error('reviewId is required'), { status: 400 });

    const client = await pool.connect();
    try{
        await client.query('BEGIN');

        const { rows } = await client.query(`
            SELECT id, user_id FROM reviews WHERE id = $1 FOR UPDATE`, [reviewId]);
        if(!rows || rows.length === 0) {
            throw Object.assign(new Error('Review not found'), { status: 404 });
        }
        const existing = rows[0];
        if(String(existing.user_id) !== String(userId)){
            throw Object.assign(new Error('Unauthorized'), { status: 403 });
        }

        await client.query('DELETE FROM reviews WHERE id = $1', [reviewId]);
        await client.query('COMMIT');
        return { deleted: true };
    }catch(error){
        await client.query('ROLLBACK');
        throw error;
    }finally {
        client.release();
    }
};

exports.getReviewById = async (reviewId, { userId = null, role = null } = {}) => {
  if (!reviewId) throw Object.assign(new Error('reviewId is required'), { status: 400 });
  const client = await pool.connect();
  try {
    const q = `
      SELECT id, user_id, product_id, rating, comment, COALESCE(images, '[]'::jsonb) AS images, created_at, updated_at
      FROM reviews
      WHERE id = $1
      LIMIT 1
    `;
    const { rows } = await client.query(q, [reviewId]);
    if (!rows || rows.length === 0) {
      throw Object.assign(new Error('Review not found'), { status: 404 });
    }
    const review = rows[0];

    // if caller is customer, enforce ownership
    if (role === 'customer' && userId) {
      if (String(review.user_id) !== String(userId)) {
        throw Object.assign(new Error('Access denied'), { status: 403 });
      }
    }

    return review;
  } finally {
    client.release();
  }
};