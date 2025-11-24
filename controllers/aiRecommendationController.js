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
    const sessionRes = await aiService.startChatSession(userId, session_id || null);
    return res.json({
      success: true,
      isNew: sessionRes.isNew,
      messages: sessionRes.messages,
      sessionId: sessionRes.sessionId
    });
  } catch (error) {
    console.error('[aiRecommendationController.startSession]', error && error.stack ? error.stack : error);
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
        if (sel.ask) return res.json({ success: true, ask: sel.ask, selected: sel.selected || null, sessionId: sel.sessionId || null });
        return res.json({ success: true, message: sel.reply || '', selected: sel.selected || null, sessionId: sel.sessionId || null });
      } catch (err) {
        console.error('[aiRecommendationController.handleChat] handleOutfitSelection error', err && err.stack ? err.stack : err);
        return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
      }
    }

    if (intent.type === 'more') {
      try {
        // Load last recommendation (use service helper) and reuse its context (occasion/weather)
        const lastRec = typeof aiService.getLastRecommendationForUser === 'function' ? await aiService.getLastRecommendationForUser(userId) : null;
        const excludeVariantIds = [];
        if (lastRec && lastRec.items) {
          try {
            const parsed = typeof lastRec.items === 'object' ? lastRec.items : JSON.parse(lastRec.items || '{}');
            const outfits = parsed && parsed.outfits ? parsed.outfits : [];
            for (const o of outfits) {
              if (!Array.isArray(o.items)) continue;
              for (const it of o.items) {
                if (typeof it === 'string' && it.trim()) excludeVariantIds.push(String(it));
                else if (it && typeof it === 'object') {
                  if (it.variant_id) excludeVariantIds.push(String(it.variant_id));
                  else if (it.id) excludeVariantIds.push(String(it.id));
                }
              }
            }
          } catch (e) { /* ignore parse errors, fallback to empty exclude list */ }
        }

        // Extract context (occasion/weather) from stored recommendation if available
        let occasionFromContext = null;
        let weatherFromContext = null;
        if (lastRec && lastRec.context) {
          try {
            const ctx = typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context;
            occasionFromContext = ctx && ctx.occasion ? ctx.occasion : null;
            weatherFromContext = ctx && ctx.weather ? ctx.weather : null;
          } catch (e) { /* ignore parse errors */ }
        }

        console.debug('[aiRecommendationController.more] reuse context', { occasionFromContext, weatherFromContext, excludeCount: excludeVariantIds.length });
        // IMPORTANT: do NOT forward the "Thêm outfit..." user message to generator (may trigger parser to ask)
        const moreRes = await aiService.generateOutfitRecommendation(userId, occasionFromContext, weatherFromContext, {
          productId: product_id,
          variantId: variant_id,
          sessionId: session_id || null,
          // message intentionally omitted to force reuse of stored context
          more: true,
          excludeVariantIds,
          maxOutfits: 1
        });
         if (!moreRes) {
           console.error('[aiRecommendationController.handleChat] generateOutfitRecommendation returned empty (more)');
           return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
         }
         if (moreRes.ask) return res.json({ success: true, ask: moreRes.ask });
         return res.json({
           success: true,
           message: moreRes.reply || 'Mình đã tìm thêm vài set khác cho bạn.',
           data: moreRes.outfits || [],
           followUp: moreRes.followUp || null,
           sessionId: moreRes.sessionId || null
         });
       } catch (err) {
         console.error('[aiRecommendationController.handleChat] generateOutfitRecommendation (more) error', err && err.stack ? err.stack : err);
         return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
       }
     }

    // default: general / contextual question
    try {
      const result = await aiService.handleGeneralMessage(userId, {
        message,
        sessionId: session_id || null,
        lastRecommendationAllowed: true
      });

      if (!result) {
        console.error('[aiRecommendationController.handleChat] handleGeneralMessage returned empty');
        return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
      }

      if (result.ask) return res.json({ success: true, ask: result.ask, sessionId: result.sessionId || null });
      return res.json({
        success: true,
        message: result.reply || '',
        data: result.outfits || null,
        sessionId: result.sessionId || null
      });
    } catch (err) {
      console.error('[aiRecommendationController.handleChat] handleGeneralMessage error', err && err.stack ? err.stack : err);
      return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
    }
  } catch (error) {
    console.error('[aiRecommendationController.handleChat] unexpected error', error && error.stack ? error.stack : error);
    return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!', error: error.message });
  }
};