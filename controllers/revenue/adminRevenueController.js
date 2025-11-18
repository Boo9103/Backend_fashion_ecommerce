const stats = require('../../services/revenueService');

exports.revenue = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const unit = (req.query.unit || 'week').toLowerCase();
    const start = req.query.start;
    const end = req.query.end;
    const data = await stats.revenueByPeriod({ unit, start, end });
    res.json({ success: true, unit, start, end, data });
  } catch (err) { next(err); }
};

exports.topProducts = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });    
    const start = req.query.start;
    const end = req.query.end;
    const limit = parseInt(req.query.limit) || 10;
    const data = await stats.topProducts({ start, end, limit });
    res.json({ success: true, start, end, limit, data });
  } catch (err) { next(err); }
};