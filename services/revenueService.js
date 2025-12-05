const pool = require('../config/db');

function safeDate(d, fallback){
    if(!d) return fallback;
    const date = new Date(d);
    if(isNaN(date)) return fallback;
    return date.toISOString().slice(0, 10);
}

exports.revenueByPeriod = async ({ unit = 'week', start = null, end = null } = {}) => {
    const s = safeDate(start, null);
    const e = safeDate(end, null);

    if (unit === 'week') {
        let sql, params;

        if (!s && !e) {
            // Trường hợp không truyền start/end → lấy 12 tuần gần nhất (rất hợp lý cho chart)
            sql = `
                SELECT week_start AS period_start, revenue, orders_count, payments_count
                FROM mv_revenue_by_week
                ORDER BY week_start DESC
                LIMIT 12
            `;
            params = [];
        } else {
            sql = `
                SELECT week_start AS period_start, revenue, orders_count, payments_count
                FROM mv_revenue_by_week
                WHERE week_start BETWEEN $1 AND $2
                ORDER BY week_start
            `;
            params = [s, e];
        }

        const { rows } = await pool.query(sql, params);
        if (!s && !e) rows.reverse(); // đảo lại để tuần cũ ở đầu là cũ nhất
        return rows;

    } else {
        const trunc = unit === 'year' ? 'year' : 'month';
        const sql = `
            SELECT date_trunc($3, day)::date AS period_start,
                SUM(revenue)::numeric(18,2) AS revenue,
                SUM(orders_count)::bigint AS orders_count,
                SUM(payments_count)::bigint AS payments_count
            FROM vw_revenue_by_day
            WHERE day BETWEEN $1 AND $2
            GROUP BY date_trunc($3, day)
            ORDER BY period_start`;
        const { rows } = await pool.query(sql, [s || '1970-01-01', e || '9999-12-31', trunc]);
        return rows;
    }
};
//date_trunc('unit', timestamp) = lấy ngày đầu tiên của đơn vị thời gian đó

exports.topProducts = async({ start, end, limit = 10}) => {
    const sql = `
        SELECT 
            variant_id,
            name_snapshot, 
            SUM(revenue)::numeric(18,2)     AS revenues,
            SUM(qty_sold)::bigint           AS qty_sold
        FROM vw_product_revenue_by_day
        WHERE day BETWEEN $1 AND $2
        GROUP BY variant_id, name_snapshot
        ORDER BY revenues DESC
        LIMIT $3`;
    const { rows } = await pool.query(sql, [start, end, limit]);
    return rows;
};

exports.summary = async ({ start, end }) => {
    const sql = `
        SELECT SUM(revenue)::numeric(18,2) AS total_revenue, SUM(orders_count)::bigint AS orders_count
        FROM vw_revenue_by_day
        WHERE day BETWEEN $1::date AND $2::date`;
    const { rows } = await pool.query(sql, [start, end]);
    return rows[0] || { total_revenue: 0, orders_count: 0 };
};