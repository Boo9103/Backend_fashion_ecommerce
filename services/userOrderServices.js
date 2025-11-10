const pool = require('../config/db');

const promotionService = require('./userPromotionService');


// Chính sách áp voucher: áp cho 1 item đủ điều kiện có line_base cao nhất
const APPLY_POLICY = 'all_eligible_items';
exports.createOrder = async (userId, orderData) => {
    // support both signatures:
    //  - createOrder(orderData)
    //  - createOrder(userId, orderData)
    if (!orderData && userId && typeof userId === 'object') {
        orderData = userId;
        userId = orderData.user_id || null;
    }

    // guard
    orderData = orderData || {};

    const {
        shipping_address_snapshot,  // json object or JSON string
        payment_method, // 'cod' || 'online' || ...
        items,  // [ {variant_id, quantity}, ... ]
        promotion_code,
        shipping_fee = 0
    } = orderData;

    const user_id = userId || orderData.user_id || null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Validate items
        if (!Array.isArray(items) || items.length === 0){
            throw new Error ('Cart is empty');
        }

        // Validate shipping address snapshot: accept object or JSON string
        // normalize shipping_address_snapshot (it may be sent as JSON string)
        // possible keys that client might send
        const possibleKeys = [
          'shipping_address_snapshot',
          'shipping_address',
          'shippingAddress',
          'address_snapshot',
          'address'
        ];

        let addr;
        // try direct variable first (if destructured)
        if (shipping_address_snapshot !== undefined && shipping_address_snapshot !== null) {
          addr = shipping_address_snapshot;
        } else {
          // try to find in orderData under common keys
          for (const k of possibleKeys) {
            if (Object.prototype.hasOwnProperty.call(orderData, k)) {
              addr = orderData[k];
              break;
            }
          }
        }

        // if addr is string, try parse JSON
        if (typeof addr === 'string') {
          try {
            addr = JSON.parse(addr);
          } catch (err) {
            console.log('createOrder - shipping address parse error:', err.message);
            throw new Error('Invalid shipping address: cannot parse JSON');
          }
        }

        // debug log to help troubleshooting
        console.log('createOrder - resolved shipping address snapshot:', addr, 'orderData keys:', Object.keys(orderData || {}));

        // accept both snake_case and camelCase keys inside addr
        const fullName = addr && (addr.full_name || addr.fullName || addr.name);
        const phone = addr && (addr.phone || addr.telephone || addr.mobile);
        const addressLine = addr && (addr.address || addr.line1 || addr.address_line);

        if (!fullName || !phone || !addressLine) {
          throw new Error('Invalid shipping address');
        }
        // use normalized addr object from now on
        addr = Object.assign({}, addr, { full_name: fullName, phone, address: addressLine });

        if (!payment_method || !['cod', 'online'].includes(payment_method)) {
            throw new Error('payment_method is required and must be cod or online');
        }

        // Chuẩn hóa input
        const variantIds = items.map(item => item.variant_id); //-> lấy toàn bộ variant_id từ items thành 1 mảng
        const qtyMap = items.reduce((acc, it)=>{
            if(!Number.isInteger(it.quantity) || it.quantity <= 0){
                throw new Error('invalid quantity');
            }

            acc[it.variant_id] = it.quantity;
            return acc;
        }, {}); //-> biến đổi mảng items thành object { variant_id: quantity, ...}

        // 2. Lấy thông tin variants 

        const stockRes = await client.query(`
            SELECT
                pv.id AS variant_id,
                pv.product_id AS product_id,
                pv.stock_qty AS stock_qty,
                p.name AS product_name,
                p.price AS unit_price,
                pv.color_name AS variant_color,
                pv.sizes AS variant_size
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.id
            WHERE pv.id = ANY($1::uuid[])
            `, [variantIds]
        );

        if(stockRes.rowCount !== variantIds.length){
            throw new Error('One or more product variants not found');
        }

        //Kiểm tra tồn kho
        //qtyMap = { variant_id: quantity, ...} -> qtyMap[row.variant_id] = quantity tương ứng cua variant_id
        for (const row of stockRes.rows){
            const qty = qtyMap[row.variant_id]; //qty[row.variant_id] -> được hiểu là lấy quantity của variant_id tương ứng (truy cập thuộc tính của object qtyMap)
            if (row.stock_qty == null || row.stock_qty< qty){
                throw new Error(`Out of stock for variant ID: ${row.variant_id}: ${row.stock_qty ?? 0} available`);
            }
        }

        //Dùng map variant -> product để kiểm tra promotion và tính giảm giá
        const variantToProduct = new Map(stockRes.rows.map(r => [r.variant_id, r.product_id]));

        //3. Builder orderItems snapshot & tổng base (chưa trừ voucher)
        let total_amount = 0;
        const orderItems = stockRes.rows.map(r => { //r= row[0,1,2,...] -> ds chứa các variant product (từ fe gửi lên) -> ds mà user muốn mua
            const qty = qtyMap[r.variant_id];
            const line_base = r.unit_price * qty; // tùy thuộc vào r thì sẽ có tương ứng line_base 
            total_amount += line_base;

            return {
                variant_id: r.variant_id,
                product_id: r.product_id,
                qty,
                unit_price: r.unit_price,
                final_price: r.unit_price,
                promo_applied: false,
                name_snapshot: r.product_name,
                // use the column aliases returned by the query
                color_snapshot: r.variant_color ?? null,
                size_snapshot: r.variant_size ?? null,
                line_base
            };
        });

        //4. Áp dụng promotion (nếu có) - all eligible items + ratio allocation
        let discount_amount = 0;
        let promotion_id = null;
        let promotion_code_final = null;

        if (promotion_code){

            //a. lấy promotion hợp lệ cho user
            const promo = await promotionService.getPromotionByCode(promotion_code);
            if (!promo){
                throw new Error('Invalid or expired promotion code');
            }
            //kiểm tra ngày áp dụng
            const now = new Date();
            if (now < new Date(promo.start_date) || now > new Date(promo.end_date)) {
                throw new Error('Promotion not in valid date range');
            }

            promotion_id = promo.id;
            promotion_code_final = promo.code;

            //b. lấy danh sách product_id mà promo áp dụng
            const promoProductIds = await promotionService.getPromotionProducts(promo.id); // trả về mảng sản phẩm mà vc áp dụng được
            const appliesToAll = promoProductIds.length === 0;
            
            //c. Lọc danh sachsh product_id voucher áp dụng (mảng rỗng = áp toàn shop)
            let eligible = orderItems;
            if(!appliesToAll){
                const allowed = new Set(promoProductIds);
                eligible = orderItems.filter(ot => allowed.has(ot.product_id));

                if (eligible.length === 0){
                    throw new Error('Promotion code not applicable to these items');
                }
            }

            //d. kiểm tra min_order_Value/ usage_limit 
            if(promo.min_order_value != null && total_amount < Number(promo.min_order_value)){
                throw new Error('Order total not eligible for this promotion');
            }
            const usedCount = Number(promo.used_count) || 0;
            if(promo.usage_limit != null && usedCount >= Number(promo.usage_limit)){
                throw new Error('Promotion usage limit reached');
            }

            //e. Tính tổng tiền các item hợp lệ
            const eligibleSubtotal = eligible.reduce((sum, it) => sum +it.line_base, 0);
            if (eligibleSubtotal <= 0){
                throw new Error('Eligible subtotal is zero');
            }

            //f. tính số tiền giảm theo loại voucher + CAP(giảm tối đa)
            const rawType = String((promo.type || '')).trim().toLowerCase();
            const type = (rawType === 'percent') ? 'percentage' : rawType;
            const promoValue = Number(promo.value);
            if (!Number.isFinite(promoValue) || promoValue < 0) {
                throw new Error('Invalid promotion value');
            }
            let rawDiscount = 0;

            if(type === 'percentage'){
                rawDiscount = eligibleSubtotal * (promoValue / 100);
            }else if (type === 'amount'){
                rawDiscount = promoValue;
            }else{
                throw new Error('Unknown promotion type');
            }

            const maxCap = promo.max_discount_value != null ? Number(promo.max_discount_value) : Infinity;
            //Không vượt quá eligibleSubtotal & cap
            discount_amount = Math.min(rawDiscount, eligibleSubtotal, Number.isFinite(maxCap) ? maxCap : Infinity);
            discount_amount = round2(discount_amount);

            //g. phân bổ discount xuống từng item theo tý lệ line_base
            if (discount_amount > 0){
                const alloc = allocateByRatio(eligible, discount_amount);

                //Áp phân bổ xuống final_price từng item
                for(let i = 0; i < eligible.length; i++){
                    const it = eligible[i];
                    const part = alloc[i];
                    const newLine = Math.max(0, it.line_base - part);

                    it.promo_applied = part > 0;
                    it.final_price = round2(newLine / it.qty);
                }
            }
            
        }

        const shipFee = Number(shipping_fee) || 0;

        //5. Tính final_amount = sum(final_price * qty) + ship - discount_amount
        const itemsSumAfter = orderItems.reduce((sum, it)=> sum + it.final_price * it.qty, 0);
        const final_amount = round2(itemsSumAfter + shipFee);
        if(final_amount < 0){
            throw new Error('Computed final amount is negative');
        }

        //6. Insert orders
        const orderRes = await client.query(
            `
                INSERT INTO orders 
                    (user_id, total_amount, discount_amount, shipping_fee, final_amount,
                     shipping_address_snapshot, payment_method, payment_status, order_status,
                     promotion_id, promotion_code, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5,
                        $6, $7, 'unpaid', 'pending',
                        $8, $9, NOW(), NOW())
                RETURNING id
            `, 
            [
                user_id,
                round2(total_amount),
                round2(discount_amount),
                shipFee,
                final_amount,
                JSON.stringify(addr),
                payment_method,
                promotion_id,
                promotion_code_final
            ]
        );

        const order_id = orderRes.rows[0].id;

        //7. Insert order_items
        const oiValues = [];
        const oiParams = [];
        let idx = 1;

        for(const it of orderItems){
            oiValues.push(
            `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
        );

            oiParams.push(
                order_id,
                it.variant_id,
                it.qty,
                it.unit_price,
                it.final_price,
                it.promo_applied,
                it.name_snapshot,
                it.color_snapshot,
                it.size_snapshot
            );
        }

        await client.query(
            `INSERT INTO order_items
                (order_id, variant_id, qty, unit_price, final_price, promo_applied, name_snapshot, color_snapshot, size_snapshot)
             VALUES ${oiValues.join(', ')}
            `,
            oiParams
        );

        //8. Trừ tồn kho
        for (const it of orderItems){
            const res = await client.query(
                `UPDATE product_variants
                 SET stock_qty = stock_qty - $1, sold_qty = COALESCE(sold_qty, 0) + $1
                 WHERE id = $2 AND stock_qty >= $1`,
                 [it.qty, it.variant_id]
            );
            if (res.rowCount === 0){
                throw new Error(`Stock update failed for variant ${it.variant_id}`);
            }
        }

        //9. Tăng used_count của promotion
        if (promotion_id){
            // lock the promotion row
            const promoLock = await client.query(
                `SELECT id, used_count, usage_limit FROM promotions WHERE id = $1 FOR UPDATE`,
                [promotion_id]
            );
            if (promoLock.rowCount === 0){
                throw new Error('Promotion not found when finalizing order');
            }
            const currentUsed = Number(promoLock.rows[0].used_count) || 0;
            const usageLimit = promoLock.rows[0].usage_limit != null ? Number(promoLock.rows[0].usage_limit) : null;
            if (usageLimit != null && currentUsed + 1 > usageLimit){
                throw new Error('Promotion usage limit reached (concurrent update)');
            }

            await client.query(
                `UPDATE promotions
                 SET used_count = COALESCE(used_count, 0) + 1, updated_at = NOW()
                 WHERE id = $1`,
                 [promotion_id]
            );
        }

        await client.query('COMMIT');

        //10. Trả về kết quả
        return {
            order_id,
            total_amount: round2(total_amount),
            discount_amount: round2(discount_amount),
            shipping_fee: shipFee,
            final_amount,
            payment_status: 'unpaid',
            order_status: 'pending',
            items: orderItems.map(it => ({
                variant_id: it.variant_id,
                qty: it.qty,
                unit_price: it.unit_price,
                final_price: it.final_price,
                promo_applied: it.promo_applied,
                name_snapshot: it.name_snapshot,
                color_snapshot: it.color_snapshot,
                size_snapshot: it.size_snapshot
            }))
        };
    }catch (error){
        await client.query('ROLLBACK');
        throw error;    
    }finally{
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
    const countParams = params.slice(0, -2); // ✅ bỏ 2 phần tử CUỐI (limit, offset)
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
        if (role !== 'user') {
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
                SET stock_qty = stock_qty + $1, sold_qty = COALESCE(sold_qty, 0) - $1
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
