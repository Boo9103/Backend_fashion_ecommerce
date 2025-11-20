const express = require('express');
const router = express.Router();
const aiCtrl = require('../controllers/aiChatController');
const userBehaviorCtrl = require('../controllers/userBehaviorController');
const auth = require('../middleware/authMiddleware'); // expects requireUser or similar
const aiRecommendationController = require('../controllers/aiRecommendationController');
// POST /api/ai/chat
router.post('/ai/chat', auth.requireUser, aiCtrl.chat);

// GET  /api/ai/chat/history
router.get('/ai/chat/history', auth.requireUser, aiCtrl.history);

router.post('/ai/outfit-recommendations', auth.requireUser, aiRecommendationController.getAIOutfits);


//behavior tracking routes
// POST /api/events  (allow anonymous)
router.post('/events', userBehaviorCtrl.create);

// GET /api/events/user/recent  (requires auth)
router.get('/events/user/recent', auth.requireUser, userBehaviorCtrl.getUserRecent);

// GET /api/ai/user-behavior/events?limit=50
router.get('/ai/user-behavior/events', auth.requireUser, userBehaviorCtrl.getRecentEvents);

// GET /api/ai/user-behavior/counts?days=30
router.get('/ai/user-behavior/counts', auth.requireUser, userBehaviorCtrl.getEventCounts);

// GET /api/ai/user-behavior/top-variants?limit=10&days=90
router.get('/ai/user-behavior/top-variants', auth.requireUser, userBehaviorCtrl.getTopVariants);

// GET /api/ai/user-behavior/context?limitVariants=8&days=90
router.get('/ai/user-behavior/context', auth.requireUser, userBehaviorCtrl.getContextText);

module.exports = router;