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
  const q = `SELECT id, name, image FROM categories ORDER BY name LIMIT $1`;
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
      order,
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