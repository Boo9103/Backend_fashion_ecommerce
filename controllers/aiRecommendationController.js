const aiService = require('../services/aiRecommendationService');

exports.getAIOutfits = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { message, product_id, variant_id, occasion, weather, session_id } = req.body || {};

    // 1) If user opened chat (empty message) -> start or resume session and return welcome + history
    if (!message || message.trim() === '') {
      const sessionRes = await aiService.startChatSession(userId, session_id || null);
      return res.json({
        success: true,
        isNew: sessionRes.isNew,
        messages: sessionRes.messages,
        sessionId: sessionRes.sessionId
      });
    }

    // 2) If user requests recommendation but missing occasion or weather -> ask
    const wantsRecommendation = !!(product_id || variant_id) || /gợi ý|recommend|outfit|mix/i.test((message||''));
    if (wantsRecommendation && (!occasion || !weather)) {
      return res.json({ success: true, ask: 'Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò? Thời tiết hôm nay ra sao?' });
    }

    // 3) Proceed to generate recommendations (DB-only)
    const result = await aiService.generateOutfitRecommendation(userId, occasion, weather, {
      productId: product_id,
      variantId: variant_id,
      sessionId: session_id || null,
      message
    });

    if (result && result.ask) {
      return res.json({ success: true, ask: result.ask });
    }

    return res.json({
      success: true,
      message: result?.reply || 'Luna đã mix đồ xong cho bạn rồi nè! ✨',
      data: result?.outfits || [],
      sessionId: result?.sessionId || null
    });
  } catch (error) {
    console.error('[aiRecommendationController.getAIOutfits]', error && error.stack ? error.stack : error);
    return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!', error: error.message });
  }
};