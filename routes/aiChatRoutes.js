const express = require('express');
const router = express.Router();
const userBehaviorCtrl = require('../controllers/userBehaviorController');
const auth = require('../middleware/authMiddleware'); // expects requireUser or similar
const aiRecommendationController = require('../controllers/aiRecommendationController');

//start chat session
router.post('/ai/chat/start', auth.requireUser, aiRecommendationController.startSession);
router.get('/ai/chat/load-messages', auth.requireUser, aiRecommendationController.loadSessionMessages);
router.post('/ai/chat', auth.requireUser, aiRecommendationController.handleChat);

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

//post /create behavior event example
//{
//   "event_type": "view",
//   "metadata": {
//     "session_id": "{{session_id}}",
//     "page": "product_detail",
//     "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb",
//     "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c",
//     "device": "website"
//   }
// }

/*respone
{
    "success": true,
    "event": {
        "id": "22a521dc-143b-4060-8510-23be5afc2ff9",
        "user_id": "eba218de-6fdf-44bb-b443-8d8e7e707afc",
        "event_type": "view",
        "metadata": {
            "page": "product_detail",
            "device": "website",
            "product_id": "508ad9d2-9ba1-40fe-83b7-88d6a829a6bb",
            "session_id": "{{session_id}}",
            "variant_id": "218141e5-6166-403c-94ba-a3b35ac7d57c"
        },
        "created_at": "2025-11-22T10:25:32.799Z"
    }
}
*/