const pool = require('../config/db');

exports.addFavorite = async ({ userId, productId = null}) => {
    if(!userId) throw Object.assign(new Error('userId is required'), { statusCode: 400 });
    if(!productId) throw Object.assign(new Error('productId is required'), { statusCode: 400 });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        //tránh thêm trùng
        const q = `
            INSERT INTO favorite (user_id, product_id, created_at)
            VALUES ($1,$2, NOW())
            ON CONFLICT (user_id, product_id) DO NOTHING
            RETURNING id, user_id, product_id, created_at`;
        const params = [userId, productId];
        const { rows } = await client.query(q, params);
        await client.query('COMMIT');
        return rows[0] || null;
    }catch(err){
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

exports.removeFavorite = async({ userId, productId = null})=>{
    if(!userId) throw Object.assign(new Error('userId is required'), { statusCode: 400 });
    if(!productId) throw Object.assign(new Error('productId is required'), { statusCode: 400 });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const q = `DELETE FROM favorite WHERE user_id = $1 AND product_id = $2 RETURNING id`;
        const params = [userId, productId];
        const { rows } = await client.query(q, params);
        await client.query('COMMIT');
        return rows[0] || null;

    } catch(err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Lấy danh sách favorite products (cursor pagination dựa trên favorite.seq).
 * Params:
 *   userId - uuid
 *   cursor - last seq đã đọc (number). server trả các bản ghi có seq > cursor
 *   limit  - số bản ghi trả về
 * Trả về mảng objects { seq, product_id, name, price, final_price, supplier_id, supplier_name, images: [...] }
 */
exports.getFavorites = async (userId, { cursor = 0, limit = 20 } = {}) => {
  if (!userId) throw Object.assign(new Error('userId is required'), { status: 400 });

  const q = `
    SELECT f.seq,
           p.id AS product_id,
           p.name,
           p.description,
           p.price,
           p.sale_percent,
           p.is_flash_sale,
           p.final_price,
           s.id AS supplier_id,
           s.name AS supplier_name,
           COALESCE(
             (SELECT json_agg(json_build_object('url', pi.url) ORDER BY COALESCE(pi."position",0))
              FROM product_images pi WHERE pi.product_id = p.id AND pi.variant_id IS NULL), '[]'::json
           ) AS images
    FROM favorite f
    JOIN products p ON p.id = f.product_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE f.user_id = $1 AND f.seq > $2
    ORDER BY f.seq
    LIMIT $3
  `;
  const { rows } = await pool.query(q, [userId, Number(cursor || 0), Number(limit || 20)]);
  return rows.map(r => ({
    seq: Number(r.seq),
    product_id: r.product_id,
    name: r.name,
    description: r.description,
    price: Number(r.price || 0),
    sale_percent: Number(r.sale_percent || 0),
    is_flash_sale: !!r.is_flash_sale,
    final_price: r.final_price != null ? Number(r.final_price) : null,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name || null,
    images: r.images || []
  }));
};

// optional helper: trả product_ids (hiện có)
exports.getFavoriteProductIds = async (userId) => {
  if(!userId) throw Object.assign(new Error('userId is required'), { status: 400 });
  const { rows } = await pool.query(`SELECT product_id FROM favorite WHERE user_id = $1 ORDER BY seq`, [userId]);
  return rows.map(r => r.product_id);
};