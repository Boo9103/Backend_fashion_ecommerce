const userPromotionService = require('../../services/userPromotionService');
const promotionService = require('../../services/userPromotionService');


exports.listForHome = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const promos = await userPromotionService.listPromotions({ page, limit });

    // debug: print user and promo ids
    console.debug('[listForHome] req.user:', req.user && req.user.id ? req.user.id : null);
    const promoIds = promos.map(p => String(p.id));
    console.debug('[listForHome] promoIds:', promoIds);

    if (req.user && req.user.id && Array.isArray(promos) && promos.length) {
      const uid = req.user.id;
      const collectedMap = await userPromotionService.getCollectedPromotionMap(uid, promoIds);
      console.debug('[listForHome] collectedMap keys:', Object.keys(collectedMap));

      const annotated = promos.map(p => {
        const meta = collectedMap[String(p.id)] || null;
        return {
          ...p,
          collected: !!meta,
          user_action: meta ? meta.action : null,
          collected_at: meta ? meta.collected_at : null
        };
      });
      return res.json({ promotions: annotated });
    }

    return res.json({ promotions: promos.map(p => ({ ...p, collected: false, user_action: null, collected_at: null })) });
  } catch (err) {
    next(err);
  }
};

exports.collect = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const promotionId = req.params.id;
    if (!promotionId) return res.status(400).json({ message: 'Promotion id is required' });

    // accept code from body, query or header (fallback)
    const bodyCode = req.body && req.body.code;
    const queryCode = req.query && req.query.code;
    const headerCode = req.get && (req.get('x-promo-code') || req.get('promo-code'));
    const codeVal = (bodyCode || queryCode || headerCode) ? String(bodyCode || queryCode || headerCode).trim() : null;

    const result = await userPromotionService.collectPromotion(userId, promotionId, codeVal);

    return res.json({
      collected: true,
      created: !!result.created,
      id: result.id,
      code: result.code || null
    });
  } catch (err) {
    if (err && err.status === 409) return res.status(409).json({ message: err.message });
    next(err);
  }
};

exports.collectByCode = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { code } = req.body || {};
    if (!code || !String(code).trim()) return res.status(400).json({ message: 'Promotion code is required' });

    const r = await userPromotionService.collectByCode(userId, String(code).trim());
    return res.json({ collected: true, created: !!r.created, promotion: r.promotion });
  } catch (err) {
    // if service throws 409 for duplicate, forward it to client
    if (err && err.status === 409) return res.status(409).json({ message: err.message });
    next(err);
  }
};

exports.checkCode = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { code, eligibleSubtotal, save } = req.body || {};

    if (code && String(code).trim()) {
      const result = await userPromotionService.checkPromotionCode(String(code).trim(), { userId: null, eligibleSubtotal });
      let collected = false;
      let created = false;

      if (userId) {
        const details = await userPromotionService.getCollectedPromotionMap(userId, [result.promotion.id]);
        collected = !!details[result.promotion.id];
      }

      if (save && userId) {
        try {
          const r = await userPromotionService.collectByCode(userId, String(code).trim());
          created = !!r.created;
          collected = true;
        } catch (e) {
          if (e && e.status === 409) {
            collected = true;
            created = false;
          } else {
            throw e;
          }
        }
      }

      return res.json({
        valid: true,
        promotion: result.promotion,
        product_ids: result.product_ids || [],
        eligibleSubtotal: result.eligibleSubtotal != null ? result.eligibleSubtotal : null,
        collected,
        created
      });
    }

    // no code => return user's collected promotions eligible for checkout
    const promos = await userPromotionService.getEligibleCollectedPromotionsForCheckout(userId, { eligibleSubtotal: eligibleSubtotal != null ? Number(eligibleSubtotal) : null });
    return res.json({ promotions: promos });
  } catch (err) {
    next(err);
  }
};

exports.getPromotionById = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Promotion id is required' });

    const promo = await userPromotionService.getPromotionById(id);
    if (!promo) return res.status(404).json({ message: 'Promotion not found' });
    return res.json({ promotion: promo });
  } catch (err) {
    next(err);
  }
};

exports.getUserPromotions = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const promos = await userPromotionService.getUserCollectedPromotions(userId, { page, limit });
    return res.json({ promotions: promos });
  } catch (err) {
    next(err);
  }
};

exports.preview = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    const { items = [], shipping_fee = 0, promotion_code = null, save = false } = req.body;

    console.error('[promotion.preview] userId=%s incoming payload items count=%d', userId, Array.isArray(items) ? items.length : 0);
    console.error('[promotion.preview] raw items sample', JSON.stringify(items, null, 2));

    // service will merge by variant+size
    const preview = await promotionService.getPreviewPromotionApplication({ items, shipping_fee, promotion_code, userId });

    console.error('[promotion.preview] preview result', JSON.stringify(preview, null, 2));
    return res.json(preview);
  } catch (err) {
    console.error('[promotion.preview] error', err && err.stack ? err.stack : err);
    next(err);
  }
};