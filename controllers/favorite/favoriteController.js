const favoriteService = require('../../services/userFavoriteService');

exports.addFavorite = async (req, res, next) => {
    try{
        const userId = req.user?.id;
        const { productId } = req.body;
        if(!userId) return res.status(403).json({ error: 'Forbidden' });
        if(!productId) return res.status(400).json({ error: 'Product ID is required' });

        const favorite = await favoriteService.addFavorite({ userId, productId });
        return res.status(201).json({
            message: 'Product added to favorites successfully',
            favorite
        });

    } catch (error) {
        console.error('[user.fav.add]', error && error.stack ? error.stack : error);
        next(error);
    }
};

exports.removeFavorite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(403).json({ error: 'Forbidden' });
        const userId = req.user.id;
        const productId = req.params.productId;
        if (!productId) return res.status(400).json({ error: 'productId is required' });

        const removed = await favoriteService.removeFavorite({ userId, productId });
        if (!removed) return res.status(404).json({ success: false, error: 'Favorite not found' });
        return res.json({ success: true });
    } catch (err) {
        console.error('[user.fav.remove]', err && err.stack ? err.stack : err);
        next(err);
    }
};

exports.getListIdsFavorite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(403).json({ error: 'Forbidden' });
        const userId = req.user.id;
        const ids = await favoriteService.getFavoriteProductIds(userId);
        return res.json({ success: true, product_ids: ids });
    } catch (err) {
        console.error('[user.fav.list]', err && err.stack ? err.stack : err);
        next(err);
    }
};

exports.checkFavorite = async (req, res, next) => {
    try {
        if (!req.user) return res.status(403).json({ error: 'Forbidden' });
        const userId = req.user.id;
        const productId = req.params.productId;
        if (!productId) return res.status(400).json({ error: 'productId is required' });

        const ok = await favoriteService.isFavorite({ userId, productId });
        return res.json({ success: true, is_favorite: !!ok });
    } catch (err) {
        console.error('[user.fav.check]', err && err.stack ? err.stack : err);
        next(err);
    }
};

// GET /user/favorites/list?cursor=123&limit=20
exports.getListFavorite = async (req, res, next) => {
  try {
    if (!req.user) return res.status(403).json({ error: 'Forbidden' });
    const userId = req.user.id;
    const cursor = req.query.cursor ? Number(req.query.cursor) : 0;
    const limit = Math.min(100, Number(req.query.limit) || 20);

    const items = await favoriteService.getFavorites(userId, { cursor, limit });

    // group by supplier_name
    const groupedMap = {};
    for (const it of items) {
      const key = it.supplier_name || 'Others';
      if (!groupedMap[key]) groupedMap[key] = { supplier_name: key, supplier_id: it.supplier_id || null, items: [] };
      groupedMap[key].items.push(it);
    }
    // sort groups by supplier_name
    const grouped = Object.values(groupedMap).sort((a,b) => {
      if (a.supplier_name === 'Others') return 1;
      if (b.supplier_name === 'Others') return -1;
      return a.supplier_name.toLowerCase().localeCompare(b.supplier_name.toLowerCase());
    });

    const lastSeq = items.length ? items[items.length - 1].seq : null;
    return res.json({ success: true, grouped, items, nextCursor: lastSeq });
  } catch (err) {
    console.error('[user.fav.getListFavorite]', err && err.stack ? err.stack : err);
    next(err);
  }
};