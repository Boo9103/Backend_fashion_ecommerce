const publicService = require('../services/publicService');
const productService = require('../services/productService');
const pool = require('../config/db'); // add this line near top with other requires

exports.getHomeMeta = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const data = await publicService.getHomeMeta({ limit });
    return res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getHomeProducts = async (req, res, next) => {
  try {
    const type = (req.query.type || 'all').toString();
    const suppliersQs = req.query.suppliers || '';
    const suppliers = suppliersQs ? suppliersQs.split(',').map(s => s.trim()).filter(Boolean) : [];

    const limit = Number(req.query.limit) || 8;
    const page = Number(req.query.page) || 1;

    // parse cursor nếu FE gửi (ưu tiên cursor cho keyset)
    let cursor = undefined;
    if (req.query.cursor !== undefined && req.query.cursor !== null && req.query.cursor !== '') {
      const cv = Number(req.query.cursor);
      if (Number.isFinite(cv)) cursor = cv;
    }

    // parse order param (asc|desc)
    const order = (req.query.order || 'asc').toString().toLowerCase();

    const data = await publicService.getHomeProducts({
      type,
      suppliers,
      limit,
      page,
      cursor,
      order
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getProductsSimple = async (req, res, next) => {
    try {
        const limit = Math.max(1, Number(req.query.limit) || 40);
        const order = (req.query.order || 'asc').toString().toLowerCase();

        // parse cursor only if client provided it
        let cursorProvided = false;
        let cursor;
        if (req.query.cursor !== undefined && req.query.cursor !== null && req.query.cursor !== '') {
            const c = Number(req.query.cursor);
            if (Number.isFinite(c)) {
                cursor = c;
                cursorProvided = true;
            }
        }

        // If client didn't provide cursor -> enable keyset:
        // - asc: start from 0
        // - desc: start from max(sequence_id)
        if (!cursorProvided) {
            if (order === 'asc') {
                cursor = 0;
            } else {
                const { rows } = await pool.query(
                  `SELECT COALESCE(MAX(sequence_id::bigint), 0) AS m FROM products WHERE status = 'active'`
                );
                const m = rows && rows[0] ? Number(rows[0].m) : 0;
                if (m > 0) cursor = m;
                else cursor = undefined; // fallback to offset behavior if no seq present
            }
        }

        const callArgs = { limit, order, ...(cursor !== undefined ? { cursor } : {}) };
        const resp = await productService.getProducts(callArgs);

        // normalize both return shapes (array or { products,... })
        const normalized = Array.isArray(resp)
            ? { products: resp, nextCursor: null, hasMore: resp.length === limit }
            : resp;

        return res.json({
            items: normalized.products || [],
            perPage: limit,
            nextCursor: normalized.nextCursor ?? null,
            hasMore: !!normalized.hasMore
        });
    } catch (err) {
        next(err);
    }
};
