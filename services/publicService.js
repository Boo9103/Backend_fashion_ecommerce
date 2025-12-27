const pool = require('../config/db');
const productService = require('../services/productService');

// helper: get max sequence_id (numeric) with optional where clause
const getMaxSequenceId = async (whereClause = '', params = []) => {
    const q = `SELECT COALESCE(MAX(sequence_id::bigint), 0) AS m FROM products ${whereClause ? 'WHERE ' + whereClause : ''}`;
    const { rows } = await pool.query(q, params);
    return rows && rows[0] ? Number(rows[0].m) : 0;
};

exports.getBrands = async ({ limit = 50 } = {}) => {
    const q = `SELECT id, name, logo_url FROM suppliers ORDER BY name LIMIT $1`;
    const { rows } = await pool.query(q, [limit]);
    return rows;
};

exports.getCategories = async ({ limit = 50 } = {}) => {
    const q = `SELECT id, name, image, parent_id FROM categories ORDER BY name LIMIT $1`;
    const { rows } = await pool.query(q, [limit]);
    return rows;
};

exports.getHomeMeta = async (opts = {}) => {
    const [brands, categories] = await Promise.all([exports.getBrands(opts), exports.getCategories(opts)]);
    return { brands, categories };
};

// hổ trợ kết quả lấy từ getproducts để chuẩn hóa, nếu offset mode trả về mảng, cursor mode trả về object --> chuẩn hóa thành object có products, nextCursor, hasMore
const normalizeProductsResp = (resp) => {
    if (!resp) return { products: [], nextCursor: null, hasMore: false };
    if (Array.isArray(resp)) return { products: resp, nextCursor: null, hasMore: resp.length === 0 ? false : undefined };
    // resp is object returned in cursor mode
    return {
      products: resp.products || resp.items || resp,
      nextCursor: resp.nextCursor ?? resp.next_cursor ?? null,
      hasMore: resp.hasMore ?? resp.has_more ?? (Array.isArray(resp.products) ? resp.products.length === 0 ? false : undefined : false)
    };
};

exports.getHomeProducts = async ({ type = 'all', suppliers = [], limit = 8, cursor = null, page = 1, order = 'asc' } = {}) => {
    // Normalize suppliers
    let supplierList = Array.isArray(suppliers) ? suppliers.slice() : [];
    if (!supplierList.length && typeof suppliers === 'string' && suppliers.trim()) {
      supplierList = suppliers.split(',').map(s => s.trim()).filter(Boolean);
    }

    const perPage = Math.max(1, Number(limit) || 8);
    const pageNum = Math.max(1, Number(page) || 1);

    // Helper to get total count
    const countQuery = async (sql, params = []) => {
      const { rows } = await pool.query(sql, params);
      return rows && rows[0] ? Number(rows[0].cnt) : 0;
    };

    const result = {};

    // Supplier group (keep offset/limit behavior)
    if (type === 'supplier' || type === 'all') {
      result.bySupplier = {};
      if (supplierList.length) {
        const supplierJobs = supplierList.map(async (sup) => {
          const resp = await productService.getProducts({
            supplier_id: sup,
            limit: perPage,
            page: pageNum, // offset mode
            order
          }).catch(() => []);
          const normalized = normalizeProductsResp(resp);
          const total = await countQuery(
            `SELECT COUNT(*)::int AS cnt FROM products WHERE supplier_id = $1 AND status = 'active'`,
            [sup]
          ).catch(() => 0);
          const hasMore = total > pageNum * perPage;
          result.bySupplier[sup] = { items: normalized.products, total, page: pageNum, perPage, hasMore };
        });
        await Promise.all(supplierJobs);
      }
    }

    // Flash sales group (use keyset/cursor when FE provides cursor)
    if (type === 'flash' || type === 'all') {
      // Use keyset only when cursor provided by client. For first page (no cursor),
      // let productService return ORDER BY ... LIMIT to include highest seq item.
      const useCursor = cursor !== undefined && cursor !== null;
      const resp = await productService.getProducts({
        is_flash_sale: true,
        limit: perPage,
        order,
        ...(useCursor ? { cursor } : {})
      }).catch(() => ({ products: [], nextCursor: null }));

      const normalized = normalizeProductsResp(resp);
      const total = await countQuery(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE is_flash_sale = true AND status = 'active'`
      ).catch(() => 0);
      result.flashSales = { items: normalized.products, total, perPage, nextCursor: normalized.nextCursor, hasMore: normalized.hasMore };
    }

    // Newest group (use keyset/cursor)
    if (type === 'newest' || type === 'all') {
      const useCursorNewest = cursor !== undefined && cursor !== null;
      const resp = await productService.getProducts({
        limit: perPage,
        order: 'desc',
        sort_by: 'created_at',
        ...(useCursorNewest ? { cursor } : {})
      }).catch(() => ({ products: [], nextCursor: null }));

      const normalized = normalizeProductsResp(resp);
      const total = await countQuery(
        `SELECT COUNT(*)::int AS cnt FROM products WHERE status = 'active'`
      ).catch(() => 0);
      result.newest = { items: normalized.products, total, perPage, nextCursor: normalized.nextCursor, hasMore: normalized.hasMore };
    }

    return result;
};

exports.getReviewsByProduct = async (productId, {page = 1, limit = 10} = {}) => {
    if(!productId) throw Object.assign(new Error('ProductId is required'), { status: 400 });
    const offset = Math.max(0, (Number(page) - 1)) * Number(limit);
    const client = await pool.connect();
    try {
      //list reviews
      const q = `
        SELECT p.name AS product_name, r.id as review_id, r.user_id, r.rating, r.comment, COALESCE(r.images, '[]'::jsonb) AS images, r.created_at,
            CASE 
              WHEN TRIM(COALESCE(u.full_name, '')) != '' THEN TRIM(u.full_name)
              WHEN TRIM(COALESCE(u.name, '')) != '' THEN TRIM(u.name)
              ELSE 'Khách hàng ẩn danh'
            END AS user_name
        FROM reviews r
        JOIN products p On p.id = r.product_id
        JOIN users u ON u.id = r.user_id
        WHERE product_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3        
      `;
      const { rows } = await client.query(q, [productId, limit, offset]);
      //summary: totla count and avg rating
      const summary = `SELECT COUNT(*)::int AS total_count, COALESCE(AVG(rating)::numeric, 0) AS avg_rating FROM reviews WHERE product_id = $1`;
      const sres = await client.query(summary, [productId]);
      const total = sres.rows[0] ? Number(sres.rows[0].total_count) : 0;
      const avg_rating = sres.rows[0] ? Number(sres.rows[0].avg_rating) : 0;

      return { reviews: rows, total, avg_rating, page: Number(page), perPage: Number(limit)};
    }finally{
      client.release();
    }
};

exports.getCategoriesWithProducts = async (perChildLimit = 10) => {
    const client = await pool.connect();
    try {
        // lấy category cha (parent_id IS NULL)
        const parentsRes = await client.query(
            `SELECT id, name, image FROM categories WHERE parent_id IS NULL ORDER BY name`
        );
        const parents = parentsRes.rows || [];

        const result = [];
        for (const p of parents) {
            // lấy category con
            const childrenRes = await client.query(
                `SELECT id, name, image FROM categories WHERE parent_id = $1 ORDER BY name DESC`,
                [p.id]
            );
            const children = [];

            for (const c of (childrenRes.rows || [])) {
                // lấy tối đa perChildLimit sản phẩm active trong category con
                const prodRes = await client.query(
                    `SELECT id, name, description, price, sale_percent, is_flash_sale, final_price, category_id, supplier_id, category_name, supplier_name, product_images, variants, sequence_id
                     FROM v_product_full
                     WHERE category_id = $1 AND status = 'active'
                     ORDER BY created_at DESC
                     LIMIT $2`,
                    [c.id, Number(perChildLimit) || 10]
                );

                children.push({
                    id: c.id,
                    name: c.name,
                    image: c.image || null,
                    products: prodRes.rows || []
                });
            }

            result.push({
                id: p.id,
                name: p.name,
                image: p.image || null,
                children
            });
        }

        return result;
    } finally {
        client.release();
    }
};

exports.getTopBrandsByQuarter = async ({ quarter, year, limit = 3} = {}) => {
  let sql, params;

  if(quarter && year){
    // Lấy quý cụ thể: ví dụ 2025-Q4
    sql = `
      SELECT 
          quarter, brand_id, brand_name, brand_logo,
          revenue::text, total_sold, orders_count
      FROM vw_brand_revenue_by_quarter
      WHERE year = $1 AND quarter_num = $2
      ORDER BY revenue DESC
      LIMIT $3`;
    
    params = [year, quarter, limit];
  }
  else{
    // MẶC ĐỊNH: Lấy quý hiện tại (ví dụ đang là Q4 2025)
    sql = `
      SELECT 
        quarter, brand_id, brand_name, brand_logo,
        revenue::text, total_sold, orders_count
      FROM vw_brand_revenue_by_quarter
      WHERE quarter = (
        SELECT CONCAT(EXTRACT(YEAR FROM CURRENT_DATE), '-Q', EXTRACT(QUARTER FROM CURRENT_DATE))
      )
      ORDER BY revenue DESC
      LIMIT $1
    `;
    params = [limit];
  }
  const { rows } = await pool.query(sql, params);
  return rows;
};