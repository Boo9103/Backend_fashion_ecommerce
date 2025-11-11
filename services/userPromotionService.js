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

exports.listPromotions = async ({ page = 1, limit = 20 } = {})=> {
    const offset = (page - 1)*limit;

    const q = `
        SELECT 
            p.*,
            CASE WHEN COUNT(pp.product_id) = 0 THEN 'all_products' ELSE 'specific' END AS applies_to,
            CASE WHEN COUNT(pp.product_id) = 0 THEN total_products ELSE COUNT(DISTINCT pp.product_id) END AS product_count
        FROM promotions p
        LEFT JOIN promotion_products pp ON pp.promotion_id = p.id
        CROSS JOIN (SELECT COUNT(*) AS total_products FROM products) t
        WHERE p.status = 'active'
            AND (p.start_date IS NULL OR p.start_date <= NOW())
            AND (p.end_date IS NULL OR p.end_date >= NOW())
        GROUP BY p.id, t.total_products
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2
        `;

    const { rows } = await pool.query(q, [limit, offset]);
    return rows;
};

// exports.getPromotionById = async (promotionId)=>{
//     const client = await pool.connect();
//     try {
//         const promoRes = await client.query(`
//             SELECT * FROM promotions WHERE id = $1 LIMIT 1`,
//         [promotionId]);
//         if (promoRes.rows.length === 0) return null;
//         const promo = promoRes.rows[0];

//         const prodRes = await client.query(`
//             SELECT product_id FROM promotion_products WHERE promotion_id = $1`,
//         [promotionId]);


//     }
// }