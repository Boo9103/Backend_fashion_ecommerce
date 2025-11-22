const userBehaviorService = require('../services/userBehaviorService');

exports.getRecentEvents = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.id || req.user.userId);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Number(req.query.limit) || 50;
    const rows = await userBehaviorService.getRecentEvents(userId, limit);
    return res.json({ success: true, events: rows });
  } catch (err) {
    console.error('[userBehaviorController.getRecentEvents]', err && err.stack ? err.stack : err);
    next(err);
  }
};

exports.getEventCounts = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.id || req.user.userId);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const days = Number(req.query.days) || 30;
    const counts = await userBehaviorService.getEventCounts(userId, days);
    return res.json({ success: true, counts });
  } catch (err) {
    console.error('[userBehaviorController.getEventCounts]', err && err.stack ? err.stack : err);
    next(err);
  }
};

exports.getTopVariants = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.id || req.user.userId);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Number(req.query.limit) || 10;
    const days = Number(req.query.days) || 90;
    const top = await userBehaviorService.getTopInteractedVariants(userId, limit, days);
    return res.json({ success: true, top });
  } catch (err) {
    console.error('[userBehaviorController.getTopVariants]', err && err.stack ? err.stack : err);
    next(err);
  }
};

exports.getContextText = async (req, res, next) => {
  try {
    const userId = req.user && (req.user.id || req.user.userId);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limitVariants = Number(req.query.limitVariants) || 8;
    const days = Number(req.query.days) || 90;
    const text = await userBehaviorService.buildUserContextText(userId, { limitVariants, days });
    return res.json({ success: true, contextText: text });
  } catch (err) {
    console.error('[userBehaviorController.getContextText]', err && err.stack ? err.stack : err);
    next(err);
  }
};


exports.create = async (req, res, next) => {
  try {
    console.log('[userBehavior.create] authorization header:', req.headers['authorization']);
    console.log('[userBehavior.create] req.user before:', req.user);
    const userId = req.user && (req.user.id || req.user.userId); // <- use req.user if present
    const { event_type, metadata } = req.body || {};
    if (!event_type) return res.status(400).json({ success: false, message: 'event_type is required' });

    const evt = await userBehaviorService.logEvent({
      userId,
      eventType: event_type,
      metadata: metadata || {}
    });
    return res.status(201).json({ success: true, event: evt });
  } catch (err) {
    console.error('[eventsController.create]', err && err.stack ? err.stack : err);
    next(err);
  }
};

exports.getUserRecent = async (req, res, next) => {
  try {
    const userId = req.user ? (req.user.id || req.user.userId) : null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const limit = Number(req.query.limit) || 50;
    const rows = await userBehaviorService.getRecentEventsByUser(userId, limit);
    return res.json({ success: true, events: rows });
  } catch (err) {
    console.error('[eventsController.getUserRecent]', err && err.stack ? err.stack : err);
    next(err);
  }
};