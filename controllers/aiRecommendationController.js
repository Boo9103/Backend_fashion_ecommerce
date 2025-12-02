const aiService = require('../services/aiRecommendationService');

const detectSimpleIntent = (message) => {
  const m = (message || '').toLowerCase();
  if (/^(xem thêm|xem tiếp|thêm|show more|more)/i.test(m) || /xem thêm|xem tiếp|thêm|show more|more/.test(m)) {
    return { type: 'more' };
  }
  const sel = m.match(/(?:chọn|mình thích|mình thấy|thích).*(?:thứ\s*)?(\d+)/i) || m.match(/(?:chọn|select)\s*(\d+)/i);
  if (sel && sel[1]) {
    const idx = parseInt(sel[1], 10);
    if (!Number.isNaN(idx) && idx > 0) return { type: 'select', index: idx };
  }
  // direct "outfit 2" or "bộ 2"
  const sel2 = m.match(/(?:outfit|bộ)\s*(\d+)/i);
  if (sel2 && sel2[1]) {
    const idx = parseInt(sel2[1], 10);
    if (!Number.isNaN(idx) && idx > 0) return { type: 'select', index: idx };
  }
  return { type: 'default' };
};

// startSession: gọi khi user click vào chatbox (message = "")
exports.startSession = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { session_id } = req.body || {};
    //cho phép lazy-load từ user
    const loadMessages = req.body?.loadMessages === true || req.query?.loadMessages === 'true';
    const messagesLimit = Number(req.body?.messagesLimit || req.query?.messagesLimit) || 20;

    // NOTE: pass messagesLimit as messagesLimit for compatibility with service
    const sessionRes = await aiService.startChatSession(userId, session_id || null, { loadMessages, messagesLimit });
    return res.json({
      success: true,
      isNew: sessionRes.isNew,
      messages: sessionRes.messages || [],
      hasMore: !!sessionRes.hasMore,
      nextCursor: sessionRes.nextCursor || null,
      sessionId: sessionRes.sessionId
    });
  } catch (error) {
    console.error('[aiRecommendationController.startSession]', error && error.stack ? error.stack : error);
    return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!', error: error.message });
  }
};

//xử lý load more tin nhắn
exports.loadSessionMessages = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const sessionId = req.query?.session_id || req.body?.session_id || null;
    if (!sessionId) return res.status(400).json({ success: false, message: 'Missing session_id' });

    // normalize/validate `before` cursor (ISO string or epoch ms)
    let before = req.query?.before || req.body?.before || null;
    if (before) {
      // accept number (epoch ms) or string parseable by Date
      const parsed = (typeof before === 'number') ? new Date(before) : new Date(String(before));
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid before cursor' });
      }
      before = parsed.toISOString();
    }

    const limit = Math.min(100, Number(req.query?.limit || req.body?.limit || 20));

    // call service with options object (service returns { messages, hasMore, nextCursor })
    const page = await aiService.loadSessionMessages(sessionId, { before, limit });

    return res.json({
      success: true,
      messages: page.messages || [],
      hasMore: !!page.hasMore,
      nextCursor: page.nextCursor || null
    });
  } catch (error) {
    console.error('[aiRecommendationController.loadSessionMessages]', error && error.stack ? error.stack : error);
    return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!', error: error.message });
  }
};

// handleChat: xử lý message / recommendation (FE gọi khi user gửi message)
exports.handleChat = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { message, product_id, variant_id, occasion, weather, session_id } = req.body || {};

    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Empty message: call /api/ai/chat/start (startSession) to open chat or provide a message.' });
    }

    const intent = typeof detectSimpleIntent === 'function' ? detectSimpleIntent(message) : { type: 'default' };

    if (intent.type === 'select') {
      try {
        const sel = await aiService.handleOutfitSelection(userId, session_id || null, intent.index);
        if (!sel) {
          console.error('[aiRecommendationController.handleChat] handleOutfitSelection returned empty');
          return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
        }
        if (Array.isArray(sel.messages) && sel.messages.length > 0) {
          return res.json({ success: true, messages: sel.messages });
        } else {
          return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
        }
      } catch (error) {
        console.error('[aiRecommendationController.handleChat] handleOutfitSelection error', error && error.stack ? error.stack : error);
        return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!', error: error.message });
      }
    }

    const weatherData = (typeof weather === 'string' && weather.trim() !== '') ? JSON.parse(weather) : null;
    const occasionData = (typeof occasion === 'string' && occasion.trim() !== '') ? JSON.parse(occasion) : null;

    // gọi service xử lý message và nhận gợi ý (recommendation)
    const aiRes = await aiService.handleChatMessage(userId, message, {
      sessionId: session_id || null,
      productId: product_id || null,
      variantId: variant_id || null,
      weather: weatherData,
      occasion: occasionData
    });

    return res.json({ success: true, messages: aiRes.messages || [] });
  } catch (error) {
    console.error('[aiRecommendationController.handleChat]', error && error.stack ? error.stack : error);
    return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!', error: error.message });
  }
};