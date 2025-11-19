const pool = require('../config/db');

exports.getPromotionByCode = async (code)=> {
    const result = await pool.query(`
        SELECT id, code, type, value, min_order_value, max_discount_value,
            start_date, end_date, usage_limit, used_count, status
        FROM promotions
        WHERE UPPER(code) = UPPER($1) AND status = 'active'
            AND(start_date IS NULL OR NOW() >= start_date)
            AND(end_date IS NULL OR NOW() <= end_date)
        LIMIT 1
        `,[code]);
    return result.rows[0] || null;
};

exports.getPromotionProducts = async (promotionId)=> {
    const result = await pool.query(`
        SELECT product_id
        FROM promotion_products
        WHERE promotion_id = $1
        `,[promotionId]);
    return result.rows.map(row => row.product_id);
}

exports.listPromotions = async ({ page = 1, limit = 20 } = {}) => {
    const offset = (page - 1) * limit;
    const q = `
        SELECT
            p.*,
            CASE WHEN NOT EXISTS (SELECT 1 FROM promotion_products pp WHERE pp.promotion_id = p.id) THEN 'all_products' ELSE 'specific' END AS applies_to,
            CASE WHEN NOT EXISTS (SELECT 1 FROM promotion_products pp WHERE pp.promotion_id = p.id)
                 THEN (SELECT COUNT(*) FROM products)
                 ELSE (SELECT COUNT(*) FROM promotion_products pp WHERE pp.promotion_id = p.id)
            END AS product_count
        FROM promotions p
        WHERE p.status = 'active'
          AND (p.start_date IS NULL OR p.start_date <= NOW())
          AND (p.end_date IS NULL OR p.end_date >= NOW())
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(q, [limit, offset]);
    return rows;
};

exports.getPromotionById = async (promotionId) => {
    const client = await pool.connect();
    try {
        const promoRes = await client.query(`SELECT * FROM promotions WHERE id = $1`, [promotionId]);
        if(promoRes.rows.length === 0){
            return null;
        }
        const promo = promoRes.rows[0];
        // Lấy danh sách sản phẩm áp dụng khuyến mãi
        const productsRes = await client.query(`
            SELECT product_id FROM promotion_products WHERE promotion_id = $1`, [promotionId]);
        promo.product_ids = productsRes.rows.map(r => r.product_id);
        return promo;
    } finally {
        client.release();
    }
};

exports.checkPromotionCode = async (code, { userId = null, totalAmount = null, eligibleSubtotal = null, items = null, autoCollect = false } = {}) => {
    if (!code || !String(code).trim()) {
        const e = new Error('Promotion code is required');
        e.status = 400;
        throw e;
    }

    const client = await pool.connect();
    try {
        const q = `SELECT * FROM promotions WHERE upper(code) = upper($1) LIMIT 1`;
        const { rows } = await client.query(q, [code.trim()]);
        if (rows.length === 0) {
            const e = new Error('Invalid promotion code');
            e.status = 404;
            throw e;
        }
        const promo = rows[0];

        // status & time checks
        if (promo.status !== 'active') {
            const e = new Error('Promotion code is not active');
            e.status = 400;
            throw e;
        }
        const now = new Date();
        if (promo.start_date && now < new Date(promo.start_date)) {
            const e = new Error('Promotion code is not active yet');
            e.status = 400;
            throw e;
        }
        if (promo.end_date && now > new Date(promo.end_date)) {
            const e = new Error('Promotion code has expired');
            e.status = 400;
            throw e;
        }
        if (promo.usage_limit != null && Number(promo.used_count || 0) >= Number(promo.usage_limit)) {
            const e = new Error('Promotion usage limit reached');
            e.status = 400;
            throw e;
        }

        // fetch promotion product scope
        const prodRes = await client.query(
            'SELECT product_id FROM promotion_products WHERE promotion_id = $1',
            [promo.id]
        );
        const productIds = prodRes.rows.map(r => r.product_id);

        // Compute eligible subtotal:
        // Priority: items -> eligibleSubtotal param -> totalAmount param
        let computedEligibleSubtotal = null;
        if (Array.isArray(items) && items.length > 0) {
            // items expected shape: { product_id, qty, unit_price, line_base? }
            computedEligibleSubtotal = items.reduce((sum, it) => {
                const pid = it.product_id;
                const lineBase = Number(it.line_base != null ? it.line_base : (Number(it.unit_price || 0) * Number(it.qty || 1)));
                // if promotion applies to specific products, only include those; if productIds empty => all products
                if (productIds.length === 0 || productIds.includes(pid)) {
                    return sum + (isFinite(lineBase) ? lineBase : 0);
                }
                return sum;
            }, 0);
        } else if (eligibleSubtotal != null) {
            computedEligibleSubtotal = Number(eligibleSubtotal);
        } else if (totalAmount != null) {
            computedEligibleSubtotal = Number(totalAmount);
        }

        // min_order_value should be checked against eligible subtotal when available
        if (promo.min_order_value != null && computedEligibleSubtotal != null && Number(computedEligibleSubtotal) < Number(promo.min_order_value)) {
            const e = new Error('Order total does not meet promotion minimum value');
            e.status = 400;
            throw e;
        }

        // autoCollect: try to add to user's collected list (idempotent)
        if (autoCollect && userId) {
            try {
                await exports.collectPromotion(userId, promo.id);
            } catch (e) {
                console.error('[userPromotionService.checkPromotionCode] collectPromotion failed', e && e.stack ? e.stack : e);
            }
        }

        return {
            valid: true,
            promotion: promo,
            product_ids: productIds,
            eligibleSubtotal: computedEligibleSubtotal,
            code: promo.code || null
        };
    } finally {
        client.release();
    }
};

// lưu promotion vào danh sách đã thu thập của user
exports.collectPromotion = async (userId, promotionId, code = null) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ensure promotion exists and is active
        const p = await client.query(
            `SELECT id FROM promotions WHERE id = $1 AND status = 'active' LIMIT 1`,
            [promotionId]
        );
        if (p.rows.length === 0) {
            await client.query('ROLLBACK');
            const e = new Error('Promotion not found or inactive');
            e.status = 404;
            throw e;
        }

        // check existing collected record
        const existRes = await client.query(
            `SELECT id, code FROM user_promotions WHERE user_id = $1 AND promotion_id = $2 AND action = 'collected' LIMIT 1`,
            [userId, promotionId]
        );

        if (existRes.rows.length > 0) {
            const existing = existRes.rows[0];
            // If caller provided a code (collect-by-code flow), treat duplicate attempt as conflict
            if (code && String(code).trim()) {
                await client.query('ROLLBACK');
                const err = new Error('Promotion already collected');
                err.status = 409;
                throw err;
            }
            // No code provided (UI collect button) -> idempotent success (already collected)
            await client.query('COMMIT');
            return { created: false, id: existing.id, code: existing.code || null };
        }

        // Insert new collected record (store code if provided)
        const insertRes = await client.query(
            `INSERT INTO user_promotions (id, user_id, promotion_id, action, code, created_at)
             VALUES (public.uuid_generate_v4(), $1, $2, 'collected', $3, NOW())
             RETURNING id, code`,
            [userId, promotionId, code]
        );

        await client.query('COMMIT');
        const row = insertRes.rows[0];
        return { created: true, id: row.id, code: row.code || null };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

//lấy promotion đã thu thập của user với action = 'collected'
exports.getUserCollectedPromotions = async (userId, { page = 1, limit = 20 } = {}) => {
    const offset = (page - 1) * limit;
    const q = `
        SELECT p.*,
                up.created_at AS collected_at,
                CASE WHEN NOT EXISTS (SELECT 1 FROM promotion_products pp WHERE pp.promotion_id = p.id) THEN 'all_products' ELSE 'specific' END AS applies_to
        FROM promotions p
        JOIN user_promotions up ON p.id = up.promotion_id
        WHERE up.user_id = $1 AND up.action = 'collected'
        ORDER BY up.created_at DESC
        LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(q, [userId, limit, offset]);
    return rows;
};

// Trả về danh sách promotion_id mà user đã thu thập trong tập promotionIds
exports.getCollectedPromotionIds = async(userId, promotionIds)=>{
    if(!userId || !Array.isArray(promotionIds) || promotionIds.length === 0){
        return [];
    }

    const q = `
        SELECT promotion_id
        FROM user_promotions
        WHERE user_id = $1
          AND promotion_id = ANY($2 :: uuid[])
          AND action = 'collected'
    `;

    const { rows } = await pool.query(q, [userId, promotionIds]);
    return rows.map(r => r.promotion_id);
};

exports.collectByCode = async (userId, code) => {
    if (!userId) {
        const e = new Error('Unauthorized');
        e.status = 401;
        throw e;
    }
    if (!code || !String(code).trim()) {
        const e = new Error('Promotion code is required');
        e.status = 400;
        throw e;
    }

    // Validate code (reuse checker, does not auto-collect)
    const check = await exports.checkPromotionCode(String(code).trim(), { userId: null, totalAmount: null, autoCollect: false });
    const promo = check.promotion;

    // collect and save code text for admin/audit
    const result = await exports.collectPromotion(userId, promo.id, String(code).trim());
    // result has shape { created: boolean, id, code }
    return { created: !!result.created, promotion: promo, promotion_id: promo.id, saved_code: result.code || null };
};

exports.getEligibleCollectedPromotionsForCheckout = async (userId, { eligibleSubtotal = null } = {}) => {
    if (!userId) {
        const e = new Error('Unauthorized');
        e.status = 401;
        throw e;
    }

    // eligibleSubtotal may be null -> then return all collected promotions (subject to active/time/usage checks)
    const q = `
        SELECT p.*, up.code, up.created_at AS collected_at
        FROM promotions p
        JOIN user_promotions up ON p.id = up.promotion_id
        WHERE up.user_id = $1
          AND up.action = 'collected'
          AND p.status = 'active'
          AND (p.start_date IS NULL OR p.start_date <= NOW())
          AND (p.end_date IS NULL OR p.end_date >= NOW())
          AND (p.usage_limit IS NULL OR COALESCE(p.used_count,0) < p.usage_limit)
          AND (p.min_order_value IS NULL OR $2::numeric IS NULL OR p.min_order_value <= $2)
        ORDER BY up.created_at DESC
    `;
    const { rows } = await pool.query(q, [userId, eligibleSubtotal]);
    return rows;
};

// Trả về map { promotionId: { action, code, collected_at } } cho tập promotionIds đã thu thập của user
exports.getCollectedPromotionMap = async (userId, promotionIds = []) => {
    if (!userId || !Array.isArray(promotionIds) || promotionIds.length === 0) return {};
    const q = `
        SELECT promotion_id, action, code, created_at
        FROM user_promotions
        WHERE user_id = $1
          AND promotion_id = ANY($2::uuid[])
    `;
    const { rows } = await pool.query(q, [userId, promotionIds]);
    const map = {};
    for (const r of rows) {
        map[String(r.promotion_id)] = {
            action: r.action,
            code: r.code || null,
            collected_at: r.created_at
        };
    }
    return map;
};


exports.getPreviewPromotionApplication = async ({ userId= null, items = [], shipping_fee = 0, promotion_code }) => {
    if(!promotion_code) throw Object.assign(new Error('promotion_code is required'), { status: 400 });

    //dùng lại hàm checkPromotionByCode để kiểm tra và lấy thông tin promotion
    const promo = await exports.getPromotionByCode(promotion_code);
    if(!promo){
        return { valid: false, reason: 'Invalid or not found promotion code' };
    }

    const now = new Date();
    if(now < new Date(promo.start_date) || now > new Date(promo.end_date)){
        return { valid: false, reason: 'Promotion code is not active' };
    }

    // --- MERGE items theo variant_id + size ---
    const mergedItemsRaw = mergeItemsByVariantSize(items || []);
    // minimal info log: promotion code, user and item count
    console.info('[getPreviewPromotionApplication] promo=%s user=%s items=%d', promotion_code, userId || 'anon', mergedItemsRaw.length);

    // chuẩn hóa danh sách sản phẩm, giữ size
    const normalizedItems = mergedItemsRaw.map(it => ({
        variant_id: it.variant_id,
        product_id: it.product_id ?? it.productId ?? null,
        qty: Number(it.quantity ?? it.qty ?? it.qty ?? 0),
        size: (it.size ?? null),
        unit_price: Number(it.unit_price ?? it.price ?? it.unit_price_snapshot ?? 0),
        line_base: Number(it.quantity ?? it.qty ?? 0) * Number(it.unit_price ?? it.price ?? it.unit_price_snapshot ?? 0)
    })).filter(it => it.variant_id && it.qty > 0);

    if(normalizedItems.length === 0 ){
        console.info('[getPreviewPromotionApplication] no valid items after normalization');
        return { valid: false, reason: 'No valid items provided' };
    }//trả về mảng các item hợp lệ

    //kiểm tra xem promotion áp dụng cho sản phẩm nào
    const promoProductIds = await exports.getPromotionProducts(promo.id);
    //nếu promoProductIds rỗng thì áp dụng cho tất cả sản phẩm
    const appliesToAll = promoProductIds.length === 0;
    let eligible = normalizedItems;
    //ngược lại lọc ra các sản phẩm hợp lệ (so sánh product_id hoặc variant_id)
    if (!appliesToAll) {
        const allowed = new Set(promoProductIds.map(String));
        eligible = normalizedItems.filter(it => {
            return (it.product_id && allowed.has(String(it.product_id))) || (it.variant_id && allowed.has(String(it.variant_id)));
        });
    }
    if (eligible.length === 0) {
        console.info('[getPreviewPromotionApplication] promotion not applicable to selected items');
        return { valid: false, reason: 'Promotion not applicable to selected items' };
    }

    const subtotal = normalizedItems.reduce((s, it) => s + it.line_base, 0); //lặp qua từng phần từ lấy line_base cộng dồn vào s, ban đầu s = 0
    if (promo.min_order_value != null && subtotal < Number(promo.min_order_value)) {
        console.info('[getPreviewPromotionApplication] min_order_value not reached', promo.min_order_value, subtotal);
        return { valid: false, reason: `Minimum order value ${promo.min_order_value} not reached` };
    }

    const rawType = String((promo.type || '')).trim().toLowerCase();
    const type = (rawType === 'percent') ? 'percentage' : rawType;
    const promoValue = Number(promo.value);
    if (!Number.isFinite(promoValue) || promoValue < 0) return { valid: false, reason: 'Invalid promotion value' };

    const eligibleSubtotal = eligible.reduce((s, it) => s + it.line_base, 0); //reduce là hàm lặp qua mảng, s là biến tích trữ, it là phần tử hiện tại
    let rawDiscount = 0;
    if (type === 'percentage') rawDiscount = eligibleSubtotal * (promoValue / 100);
    else if (type === 'amount') rawDiscount = promoValue;
    else return { valid: false, reason: 'Unknown promotion type' };

    const maxCap = promo.max_discount_value != null ? Number(promo.max_discount_value) : Infinity;
    const discount_amount = Math.min(rawDiscount, eligibleSubtotal, Number.isFinite(maxCap) ? maxCap : Infinity);

    // phân bổ giảm giá theo tỷ lệ (giữ thứ tự normalizedItems)
    const allocateByRatioLocal = (itemsList, totalDiscount) => {
        const s = itemsList.reduce((sum, it) => sum + it.line_base, 0);
        if (s <= 0) return itemsList.map(()=>0);
        const cents = Math.round(totalDiscount * 100);
        let used = 0;
        const alloc = [];
        for (let i=0;i<itemsList.length;i++){
          if (i < itemsList.length - 1){
            const part = Math.round((itemsList[i].line_base / s) * cents);
            alloc.push(part/100);
            used += part;
          } else {
            alloc.push((cents - used)/100);
          }
        }
        return alloc;
      };

    // allocate across eligible items but breakdown should align to normalizedItems positions
    // build a map index for normalizedItems for allocation: only allocate to items present in eligible
    const eligibleKeys = new Set(eligible.map(it => `${it.variant_id}::${it.size ?? ''}`));
    const allocFull = [];
    const allocValues = allocateByRatioLocal(eligible, discount_amount);
    // map eligible allocations to keys
    const eligibleAllocMap = {};
    for (let i = 0; i < eligible.length; i++) {
      const key = `${eligible[i].variant_id}::${eligible[i].size ?? ''}`;
      eligibleAllocMap[key] = allocValues[i] || 0;
    }
    // build breakdown aligned to normalizedItems order
    const breakdown = normalizedItems.map(it => {
        const key = `${it.variant_id}::${it.size ?? ''}`;
        return { variant_id: it.variant_id, size: it.size || null, qty: it.qty, line_base: it.line_base, discount: eligibleAllocMap[key] || 0 };
    });

    const itemsAfter = normalizedItems.map(it => {
        const found = breakdown.find(b => String(b.variant_id) === String(it.variant_id) && (b.size || '') === (it.size || ''));
        const disc = found ? found.discount : 0;
        return { ...it, discount: disc, final_line: Math.round((it.line_base - disc + Number.EPSILON) * 100) / 100 };
    });

    const itemsSumAfter = itemsAfter.reduce((s, it) => s + it.final_line, 0);
    const final_total = Math.round((itemsSumAfter + Number(shipping_fee) + Number.EPSILON) * 100) / 100;

    return {
        valid: true,
        promotion: { id: promo.id, code: promo.code, type, value: promoValue, max_discount_value: promo.max_discount_value || null },
        subtotal: eligible,                // eligible items (each has size)
        shipping_fee: Number(shipping_fee) || 0,
        discount: Math.round((discount_amount + Number.EPSILON) * 100) / 100,
        discount_breakdown: breakdown,     // includes size
        items: itemsAfter,                 // includes size and discount per item
        final_total
      };
};

/**
 * Merge items by variant_id + size so promotions are applied per variant+size.
 * Input items: [{ variant_id, quantity|qty, size, unit_price, ... }, ...]
 * Returns array of merged items with normalized keys: { variant_id, qty, size, unit_price, ... }
 */
function mergeItemsByVariantSize(items = []) {
  const map = new Map();
  for (const it of items) {
    if (!it) continue;
    const variantId = it.variant_id || it.variantId || it.variant || null;
    const size = (it.size ?? it.size_snapshot ?? '') === null ? '' : String(it.size ?? it.size_snapshot ?? '').trim();
    const rawQty = it.quantity ?? it.qty ?? 0;
    const qty = Number.isFinite(Number(rawQty)) ? Number(rawQty) : 0;
    const key = `${variantId}::${size}`;
    if (!map.has(key)) {
      map.set(key, Object.assign({}, it, { variant_id: variantId, qty, size: size || null }));
    } else {
      const cur = map.get(key);
      cur.qty = (Number(cur.qty) || 0) + qty;
      // keep first unit_price if present
    }
  }
  return Array.from(map.values());
}

exports.mergeItemsByVariantSize = mergeItemsByVariantSize;