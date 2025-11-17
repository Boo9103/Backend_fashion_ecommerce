const newsService = require('../../services/newsService');

exports.createNews = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
        const { title, content_blocks, image } = req.body;
        const result = await newsService.createNews({ title, content_blocks: content_blocks || [], image });
        return res.status(201).json({ success: true, news: result });
    } catch (err) {
        console.error('[admin.news.create]', err && err.stack ? err.stack : err);
        next(err);
    }
};

exports.updateNews = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        const payload = req.body;
        const updated = await newsService.updateNews(id, payload);
        if (!updated) return res.status(404).json({ error: 'News not found or no changes' });
        return res.json({ success: true, news: updated });
    } catch (err) {
        console.error('[admin.news.update]', err && err.stack ? err.stack : err);
        next(err);
    }
};

exports.removeNews = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        const ok = await newsService.deleteNews(id);
        if (!ok) return res.status(404).json({ error: 'News not found' });
        return res.json({ success: true });
    } catch (err) {
        console.error('[admin.news.remove]', err && err.stack ? err.stack : err);
        next(err);
    }
};


exports.listNewsAdmin = async (req, res, next) => {
    try {
        if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
        const page = Number(req.query.page) || 1;
        const limit = Math.min(100, Number(req.query.limit) || 20);
        const q = req.query.q || null;
        const items = await newsService.getNewsList({ q, page, limit });
        return res.json({ success: true, items, page, perPage: limit });
    } catch (err) {
        console.error('[admin.news.list]', err && err.stack ? err.stack : err);
        next(err);
    }
};

exports.getNewsById = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const item = await newsService.getNewsById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, news: item });
  } catch (err) {
    console.error('[admin.news.getById]', err && err.stack ? err.stack : err);
    next(err);
  }
};