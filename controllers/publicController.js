const publicService = require('../services/publicService');
const productService = require('../services/productService');
const newsService = require('../services/newsService');
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

        // parse filter params to pass to service
        const search_key = req.query.search_key || req.query.q || null;
        const category_id = req.query.category_id || null;
        const supplier_id = req.query.supplier_id || null; // supplier == brand
        const min_price = req.query.min_price !== undefined ? Number(req.query.min_price) : undefined;
        const max_price = req.query.max_price !== undefined ? Number(req.query.max_price) : undefined;
        const is_flash_sale = req.query.is_flash_sale !== undefined ? (req.query.is_flash_sale === 'true' || req.query.is_flash_sale === '1') : undefined;
        const status = req.query.status || undefined;
        const page = req.query.page ? Number(req.query.page) : undefined;


        const callArgs = {
            limit,
            order,
            ...(cursor !== undefined ? { cursor } : {}),
            ...(search_key ? { search_key } : {}),
            ...(category_id ? { category_id } : {}),
            ...(supplier_id ? { supplier_id } : {}),
            ...(min_price !== undefined ? { min_price } : {}),
            ...(max_price !== undefined ? { max_price } : {}),
            ...(typeof is_flash_sale !== 'undefined' ? { is_flash_sale } : {}),
            ...(status ? { status } : {}),
            ...(page ? { page } : {})
        };
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

exports.listReviewsByProductId = async (req, res, next) => {
  try {
    const productId = req.params.productId;
    const limt = req.query.limit ? Number(req.query.limit) : 10;
    const page = req.query.page ? Number(req.query.page): 1;

    const data = await publicService.getReviewsByProduct(
      productId, { page, limt}
    );
    return res.json({
      success: true,
      product_id: productId,
      reviews: data.reviews,
      total: data.total,
      page: data.page,
      limit: data.limit
    });
  } catch (err) {
    next(err);  
  }
};

exports.getCategoriesWithProducts = async (req, res, next) => {
  try{
    const limit = Number(req.query.limit) || 10;
    const data = await publicService.getCategoriesWithProducts(limit);
    return res.json({ categories: data });
  } catch (err) {
    next(err);
  }
};

exports.getProductById = async (req, res)=> {
    const { id } =req.params;
    try {
        const product = await productService.getProductById(id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        return res.status(200).json(product);
    }catch(error){
        console.error('getProduct error:', error && error.stack ? error.stack : error);
        return res.status(500).json({ message: 'Server error' });
    }
};

exports.getNewList = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const q = req.query.q || null;
    const items = await newsService.getNewsList({ q, page, limit });

    const transformed = items.map(it => {
      const cb = it.content_blocks || [];
      const firstText = cb.find(b => b.type === 'text')?.text || null;
      const firstImage = (cb.find(b => b.type === 'image' && Array.isArray(b.urls))?.urls?.[0]?.url) || it.image || null;
      return {
        id: it.id,
        title: it.title,
        preview_text: firstText ? firstText.slice(0, 300) : null,
        preview_image: firstImage,
        created_at: it.created_at
      };
    });

    return res.json({ success: true, items: transformed, page, perPage: limit });
  } catch (err) {
    next(err);
  }
};

exports.getNewsById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await newsService.getNewsById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    // ensure content_blocks parsed as JSON (pg returns jsonb already)
    return res.json({ success: true, news: item });
  } catch (err) {
    next(err);
  }
};