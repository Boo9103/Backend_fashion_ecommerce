const pool = require('../config/db');
const productService = require('../services/productService');

async function getOrCreateCart(userId, client = null){
    const useClient = client || (await pool.connect());
    const release = !client;

    try {
        if (!client) await useClient.query('BEGIN');

        const { rows } = await useClient.query(
            `SELECT id FROM carts WHERE user_id = $1 LIMIT 1`,
            [userId]
        );
        if (rows.length) {
            if (!client) await useClient.query('COMMIT');
            return rows[0].id;
        }

        // try insert; return id
        const insert = await useClient.query(
            `INSERT INTO carts (id, user_id, updated_at)
             VALUES (public.uuid_generate_v4(), $1, NOW())
             RETURNING id`,
            [userId]
        );

        if (!client) await useClient.query('COMMIT');
        return insert.rows[0].id;
    } catch (err) {
        if (!client) {
            await useClient.query('ROLLBACK');
        }
        // handle race: if unique violation, select existing cart
        if (err && err.code === '23505') {
            const { rows: retry } = await useClient.query(
                `SELECT id FROM carts WHERE user_id = $1 LIMIT 1`,
                [userId]
            );
            if (retry.length) {
                if (!client) await useClient.query('COMMIT');
                return retry[0].id;
            }
        }
        throw err;
    } finally {
        if (release) useClient.release();
    }
}

exports.getCart = async (userId) => {
    const client = await pool.connect();
    try{
        //đảm bảo giỏ hàng tồn tại
        const qCart = `SELECT id FROM carts WHERE user_id = $1 LIMIT 1`;
        const cRes = await client.query(qCart, [userId]);
        if(cRes.rows.length === 0) return { id: null, items: [], totalQty: 0, subtotal: 0 };

        const cartId = cRes.rows[0].id;
        const q = `
            SELECT
                ci.id,
                ci.variant_id,
                ci.qty,
                ci.price_snapshot,
                ci.size_snapshot,
                pv.sku,
                pv.color_name,
                pv.sizes,
                p.id AS product_id,
                p.name AS product_name,
                p.price AS product_price,
                p.sale_percent,
                p.is_flash_sale,
                p.final_price,
                s.name AS supplier_name,
                (SELECT pi.url FROM product_images pi WHERE pi.variant_id = pv.id LIMIT 1) AS image_url
            FROM cart_items ci
            LEFT JOIN product_variants pv ON ci.variant_id = pv.id
            LEFT JOIN products p ON p.id = pv.product_id
            LEFT JOIN suppliers s ON s.id = p.supplier_id
            WHERE ci.cart_id = $1
            ORDER BY ci.created_at DESC
        `;
        const { rows } = await client.query(q, [cartId]);

        let subtotal = 0;
        let totalQty = 0;
        const items = rows.map(r => {
            const unitPriceSnapshot = Number(r.price_snapshot);
            const qty = Number(r.qty);
            const lineTotal = Number((unitPriceSnapshot * qty).toFixed(2));

            const productPrice = Number(r.product_price || 0);
            const salePercent = Number(r.sale_percent || 0);
            const isFlash = !!r.is_flash_sale;
            const flashPrice = (r.final_price != null) ? Number(r.final_price) : null;
            const salePriceComputed = isFlash && flashPrice !== null
              ? flashPrice
              : (salePercent > 0 ? Math.round(productPrice * (1 - salePercent / 100) * 100) / 100 : null);

            const line = {
                id: r.id,
                variant_id: r.variant_id,
                sku: r.sku,
                color_name: r.color_name || null,
                size: r.size_snapshot || null,
                product_id: r.product_id,
                product_name: r.product_name,
                supplier_name: (r.supplier_name && r.supplier_name.trim()) ? r.supplier_name.trim() : null,
                qty: qty,
                unit_price: unitPriceSnapshot,
                line_total: lineTotal,
                image_url: r.image_url,

                //flash sale / sale info
                is_flash_sale: isFlash,
                sale_percent: salePercent, // percentage
                sale_price: salePriceComputed // current sale price (flash or percentage), null if none
            };

            subtotal += line.line_total;
            totalQty += line.qty;
            return line;
        });
        return { id: cartId, items, totalQty, subtotal: Number(subtotal.toFixed(2)) };
    }finally{
        client.release();
    }
};

exports.addItem = async (userId, variantId, qty = 1, size = null) => {
    if (!userId) {
        const e = new Error('Unauthorized');
        e.status = 401;
        throw e;
    }
    if (!variantId) {
        const e = new Error('variant_id is required');
        e.status = 400;
        throw e;
    }

    qty = Number(qty) || 1;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

    // ensure cart exists (reuses getOrCreateCart with same client if implemented)
    const cartId = await getOrCreateCart(userId, client);

    // get price & sale snapshot from product/variant
    const pvRes = await client.query(
        `SELECT p.price, COALESCE(p.sale_percent, 0) AS sale_percent, p.is_flash_sale, p.final_price
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = $1
         LIMIT 1`,
        [variantId]
    );
    if (pvRes.rows.length === 0) {
        const e = new Error('Variant not found');
        e.status = 404;
        throw e;
    }

    const price = Number(pvRes.rows[0].price) || 0;
    const salePercent = Number(pvRes.rows[0].sale_percent) || 0;
    const isFlash = !!pvRes.rows[0].is_flash_sale;
    const finalPrice = pvRes.rows[0].final_price != null ? Number(pvRes.rows[0].final_price) : null;
    // per requirement: if flash sale active use current flash price, otherwise use product.price (not sale_percent)
    let unitPrice;
    if (isFlash && finalPrice !== null) {
      unitPrice = finalPrice;
    } else {
      unitPrice = price;
    }
    unitPrice = Math.round(unitPrice * 100) / 100;

    // check existing cart item for same variant + size
    const exist = await client.query(
        `SELECT id, qty FROM cart_items WHERE cart_id = $1 AND variant_id = $2 AND (size_snapshot IS NOT DISTINCT FROM $3) LIMIT 1`,
        [cartId, variantId, size]
    );

    if (exist.rows.length) {
        const newQty = Number(exist.rows[0].qty) + qty;
        // update qty and refresh price_snapshot to current unitPrice (reflect flash price if any)
        await client.query(
            `UPDATE cart_items SET qty = $1, price_snapshot = $2, updated_at = NOW() WHERE id = $3`,
            [newQty, unitPrice, exist.rows[0].id]
        );
    } else {
        await client.query(
            `INSERT INTO cart_items (id, cart_id, variant_id, qty, price_snapshot, size_snapshot, created_at)
            VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, $5, NOW())`,
            [cartId, variantId, qty, unitPrice, size]
        );
    }

    // touch cart
    await client.query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cartId]);

    await client.query('COMMIT');

    // return current cart snapshot (assumes exports.getCart exists)
        return await exports.getCart(userId);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

exports.updateItem = async (userId, itemId, qty) => {
    if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    qty = Number(qty);
    if(!Number.isFinite(qty) || qty < 0){
        throw Object.assign(new Error('Invalid quantity'), { status: 400 });
    }
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        //đảm bảo giỏ hàng tồn tại
        const q = `
            SELECT ci.id, ci.cart_id
            FROM cart_items ci
            JOIN carts c ON ci.cart_id = c.id
            WHERE ci.id = $1 AND c.user_id = $2 LIMIT 1
        `;
        const r = await client.query(q, [itemId, userId]);
        if(r.rows.length == 0) throw Object.assign(new Error('Cart item not found'), { status: 404 });

        if(qty === 0 ){
            await client.query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
        }else{
            await client.query(
                `UPDATE cart_items
                SET qty = $1, updated_at = NOW()
                WHERE id = $2`,
                [qty, itemId]
            );
        }
        await client.query(
            `UPDATE carts SET updated_at = NOW() WHERE id = $1`,
            [r.rows[0].cart_id]
        );
        await client.query('COMMIT');

        // trả về snapshot giỏ hàng sau khi cập nhật
        const cart = await exports.getCart(userId);
        return cart;
    }catch(err){
        await client.query('ROLLBACK');
        throw err;
    }finally{
        client.release();
    }
};

exports.removeItem = async (userId, itemId) => {
    return this.updateItem(userId, itemId, 0);
};

exports.clearCart = async (userId) => {
    if (!userId) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const q = `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)`;
        await client.query(q, [userId]);
        await client.query(`UPDATE carts SET updated_at = NOW() WHERE user_id = $1`, [userId]);
        await client.query('COMMIT');
        return { cleared: true };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};

exports.getProductFromVariant = async (variantId) => {
    if(!variantId) return null;
    
    const client = await pool.connect();
    try {
        //lấy productid từ variant
        const q = 'SELECT product_id FROM product_variants WHERE id = $1 LIMIT 1';
        const { rows } = await client.query(q, [variantId]);
        if(!rows || rows.length === 0) return null;
        const productId = rows[0].product_id;

        //lấy chi tiết product
        const product = await productService.getProductById(productId);
        return product || null;
    } finally {
        client.release();
    }
};