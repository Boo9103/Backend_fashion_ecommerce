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
