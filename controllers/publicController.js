const publicService = require('../services/publicService');

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

    const data = await publicService.getHomeProducts({
      type,
      suppliers,
      limit,
      page
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
};
