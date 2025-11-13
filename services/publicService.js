const pool = require('../config/db');
const productService = require('../services/productService');

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
    const [brands, categories] = await Promise.all([
        exports.getBrands(opts),
        exports.getCategories(opts)
    ]);
    return { brands, categories };
};

exports.getHomeProducts = async ({ type = 'all', suppliers = [], limit = 8, page = 1 } = {}) => {
  // normalize suppliers
  let supplierList = Array.isArray(suppliers) ? suppliers.slice() : [];
  if (!supplierList.length && typeof suppliers === 'string' && suppliers.trim()) {
    supplierList = suppliers.split(',').map(s => s.trim()).filter(Boolean);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const perPage = Math.max(1, Number(limit) || 8);

  // helper to get total count
  const countQuery = async (sql, params = []) => {
    const { rows } = await pool.query(sql, params);
    return rows && rows[0] ? Number(rows[0].cnt) : 0;
  };

  const result = {};

  // supplier group
  if (type === 'supplier' || type === 'all') {
    result.bySupplier = {};
    if (supplierList.length) {
      const supplierJobs = supplierList.map(async (sup) => {
        const items = await productService.getProducts({ supplier_id: sup, limit: perPage, page: pageNum }).catch(() => []);
        const total = await countQuery(`SELECT COUNT(*)::int AS cnt FROM products WHERE supplier_id = $1 AND status = 'active'`, [sup]).catch(() => 0);
        const hasMore = total > pageNum * perPage;
        result.bySupplier[sup] = { items: items || [], total, page: pageNum, perPage, hasMore };
      });
      await Promise.all(supplierJobs);
    }
  }

  // flash group
  if (type === 'flash' || type === 'all') {
    const items = await productService.getProducts({ is_flash_sale: true, limit: perPage, page: pageNum }).catch(() => []);
    const total = await countQuery(`SELECT COUNT(*)::int AS cnt FROM products WHERE is_flash_sale = true AND status = 'active'`).catch(() => 0);
    const hasMore = total > pageNum * perPage;
    result.flashSales = { items: items || [], total, page: pageNum, perPage, hasMore };
  }

  // newest group
  if (type === 'newest' || type === 'all') {
    const items = await productService.getProducts({ limit: perPage, page: pageNum }).catch(() => []);
    const total = await countQuery(`SELECT COUNT(*)::int AS cnt FROM products WHERE status = 'active'`).catch(() => 0);
    const hasMore = total > pageNum * perPage;
    result.newest = { items: items || [], total, page: pageNum, perPage, hasMore };
  }

  return result;
};