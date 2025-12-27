//const { context } = require('@pinecone-database/pinecone/dist/assistant/data/context');
const aiService = require('../services/aiRecommendationService');

const detectSimpleIntent = (message) => {
  const m = (message || '').toLowerCase();

  const sampleSel = m.match(/(?:mẫu|mau)(?:\s*(?:số|thứ)?)?\s*(\d+)/i);
  if (sampleSel && sampleSel[1]) {
    const idx = parseInt(sampleSel[1], 10);
    if (!Number.isNaN(idx) && idx > 0) return { type: 'select', index: idx };
  }

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

function parseRecommendationItems(rawItems) {
  if (!rawItems) return { outfits: [], accessories: [], items: [] };
  let obj = rawItems;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch(e) { obj = rawItems; }
  }
  // If DB already returned jsonb -> obj is object
  if (Array.isArray(obj)) {
    // array of items (legacy) -> treat as items
    return { outfits: [], accessories: [], items: obj };
  }
  const outfits = Array.isArray(obj.outfits) ? obj.outfits : (Array.isArray(obj.items) ? obj.items : []);
  const accessories = Array.isArray(obj.accessories) ? obj.accessories : [];
  // if obj is { items: [ { variant_id,.. } ] } we still want .items
  const items = Array.isArray(obj.items) ? obj.items : (Array.isArray(obj.outfits) ? obj.outfits : []);
  return { outfits, accessories, items };
}

function extractAccessoryList(parsed, rawContext) {
  const accessories = Array.isArray(parsed.accessories) ? parsed.accessories.slice() : [];

  // normalize context.type if present
  let ctxType = null;
  try {
    const ctx = rawContext && typeof rawContext === 'string' ? JSON.parse(rawContext) : rawContext;
    ctxType = ctx?.type || ctx?.type_name || null;
  } catch (e) { /* ignore */ }

  // heuristic to detect accessory-like item (phụ)
  const isAccessoryLike = (it) => {
    if (!it) return false;
    if (typeof it === 'string') return true;
    const name = (it.name || it.category_name || '').toString().toLowerCase();
    if (/(túi|ví|kính|sunglass|phụ kiện|thắt lưng|belt|bag|wallet)/i.test(name)) return true;
    if (it.variant_id || it.product_id) {
      // treat plain product-like objects as accessory candidates if they contain image/price/name
      if (it.image_url && it.price && it.name) return true;
    }
    return false;
  };

  if ((!accessories || accessories.length === 0) && Array.isArray(parsed.items) && parsed.items.length) {
    // prefer treating items as accessories when context.type signals accessory
    if (ctxType === 'accessory' || ctxType === 'accessories' || parsed.items.every(isAccessoryLike)) {
      return parsed.items.slice();
    }
  }
  return accessories;
}

// startSession: gọi khi user click vào chatbox (message = "")
exports.startSession = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { session_id } = req.body || {};
    //cho phép lazy-load từ user
    const loadMessages = req.body?.loadMessages === true || req.query?.loadMessages === 'true';
    const messagesLimit = Number(req.body?.messagesLimit || req.query?.messagesLimit) || 20;

    let effectiveSessionId = null;
    if (session_id) {
      try {
        if (typeof aiService.getChatSessionById === 'function') {
          const userSession = await aiService.getChatSessionById(userId);
          if (!userSession) {
            console.warn('[aiRecommendationController.startSession] user has no persisted session; ignoring provided session_id', { userId, provided: session_id });
          } else if (String(userSession.id) !== String(session_id)) {
            console.warn('[aiRecommendationController.startSession] provided session_id does not belong to authenticated user; ignoring', { userId, provided: session_id, ownerSessionId: userSession.id });
            if (process.env.AI_STRICT_SESSION_OWNERSHIP === 'true') {
              return res.status(403).json({ success: false, message: 'session_id không hợp lệ cho người dùng hiện tại' });
            }
          } else {
            // ownership ok
            effectiveSessionId = session_id;
          }
        } else {
          // helper missing -> conservative: ignore provided session_id (or reject in strict mode)
          console.warn('[aiRecommendationController.startSession] aiService.getChatSessionById missing - rejecting client session_id for safety', { userId, session_id });
          if (process.env.AI_STRICT_SESSION_OWNERSHIP === 'true') {
            return res.status(403).json({ success: false, message: 'session_id không được phép' });
          }
        }
      } catch (e) {
        console.error('[aiRecommendationController.startSession] session_id validation error', e && e.stack ? e.stack : e);
        // on error: ignore provided session_id (safer than returning another user's data)
      }
    }
    
    const sessionRes = await aiService.startChatSession(userId, effectiveSessionId || null, { loadMessages, messagesLimit });
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

// xử lý message từ user
exports.handleChat = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const userRole = req.user?.role || null;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { message, product_id, variant_id, occasion, weather, session_id } = req.body || {};
    console.debug('[aiRecommendationController.handleChat] received message from userId:', userId, 'session_id:', session_id, 'message preview:', String(message || '').slice(0,100));
     if (process.env.DEBUG_AI_SERVICE) {
      try {
        console.debug('[aiRecommendationController.handleChat.DEBUG] userId:', userId, 'session_id:', session_id);
        console.debug('[aiRecommendationController.handleChat.DEBUG] incoming message preview:', String(message || '').slice(0,200));
      } catch(e) { /* ignore */ }
    }
    if (!message || message.trim() === '') {
      return res.status(400).json({ success: false, message: 'Empty message: call /api/ai/chat/start (startSession) to open chat or provide a message.' });
    }

    if (userRole === 'admin') {
      const revenueIntentRe = /\b(doanh thu|báo cáo|revenue|report|tính tiền|tổng tiền|sale|sales)\b/i;
      if (revenueIntentRe.test(String(message).toLowerCase())) {
        console.debug('[aiRecommendationController.handleChat] admin revenue intent detected', { userId });
        
        try {
          // Persist user message nếu chưa
          if (session_id && message && String(message).trim()) {
            try {
              await aiService.saveChatMessage(userId, {
                sessionId: session_id,
                role: 'user',
                content: String(message).trim()
              });
              await aiService.updateSessionTimestamp(session_id);
            } catch (e) {
              console.warn('[handleChat] persist admin message failed', e && e.stack ? e.stack : e);
            }
          }

          // 🔑 Call ONLY for admin revenue
          const revRes = await aiService.handleAdminRevenueQuery(userId, message, {
            sessionId: session_id
          });

          return res.json({
            success: true,
            type: 'admin_report',
            message: revRes.reply,
            data: revRes.data,
            breakdown: revRes.breakdown || [],
            meta: revRes.meta || {},
            sessionId: revRes.sessionId
          });
        } catch (err) {
          console.error('[handleChat] admin revenue query failed', err && err.stack ? err.stack : err);
          return res.status(500).json({
            success: false,
            message: 'Mình gặp lỗi khi xử lý báo cáo. Admin thử lại sau nhé!',
            error: err && err.message ? err.message : 'Unknown error'
          });
        }
      }
    }

    const intent = typeof detectSimpleIntent === 'function' ? detectSimpleIntent(message) : { type: 'default' };
    console.debug('[aiRecommendationController.handleChat] detected intent:', intent);

    if (intent.type === 'select') {
      try {
        const selIndex = Number(intent.index);
        if (!selIndex || selIndex < 1) {
          return res.status(400).json({ success: false, message: 'Chọn mẫu không hợp lệ.' });
        }

        // Lấy recommendation mới nhất
        let lastRec = null;
        try {
          lastRec = await aiService.getLastRecommendationForUser(userId);
        } catch (e) {
          console.error('[handleChat] getLastRecommendation failed', e);
        }

        if (!lastRec) {
          return res.json({
            success: true,
            message: 'Mình không thấy danh sách mẫu gần đây. Bạn muốn tìm gì để mình gợi ý lại nha?',
            sessionId: session_id
          });
        }

        // === ƯU TIÊN CAO NHẤT: Nếu là product_search → xử lý chọn từ danh sách tìm kiếm ===
        let contextObj = lastRec.context;
        if (typeof contextObj === 'string') {
          try { contextObj = JSON.parse(contextObj); } catch (e) { contextObj = {}; }
        }

        if (contextObj?.type === 'product_search') {
          // Lấy danh sách sản phẩm từ lastRec.items (hỗ trợ nhiều format)
          let productList = [];
          try {
            let rawItems = lastRec.items;
            if (typeof rawItems === 'string') rawItems = JSON.parse(rawItems);

            if (Array.isArray(rawItems)) {
              productList = rawItems;
            } else if (rawItems && Array.isArray(rawItems.products)) {
              productList = rawItems.products;
            } else if (rawItems && typeof rawItems === 'object') {
              // fallback: tìm bất kỳ array nào trong object
              for (const key in rawItems) {
                if (Array.isArray(rawItems[key])) {
                  productList = rawItems[key];
                  break;
                }
              }
            }
          } catch (e) {
            console.error('[handleChat] parse product_search items failed', e);
          }

          if (productList.length === 0 || selIndex > productList.length) {
            return res.json({
              success: true,
              message: `Hiện chỉ có ${productList.length} mẫu thôi ạ. Bạn chọn mẫu khác hoặc nói "xem thêm" nhé!`,
              sessionId: session_id || lastRec.session_id
            });
          }

          const chosen = productList[selIndex - 1];

          // Lưu lịch sử chat (user + assistant)
          const persistSessionId = session_id || lastRec.session_id;
          try {
            await aiService.saveChatMessage(userId, {
              sessionId: persistSessionId,
              role: 'user',
              content: message || `Mẫu ${selIndex}`
            });

            await aiService.saveChatMessage(userId, {
              sessionId: persistSessionId,
              role: 'assistant',
              content: `Đây là chi tiết mẫu ${selIndex} bạn chọn nè 😊`,
              metadata: { action: 'product_selected', selected: chosen }
            });
          } catch (e) {
            console.warn('[handleChat] save chat message failed (product select)', e);
          }

          // Lưu recommendation chọn sản phẩm (để audit)
          try {
            await aiService.saveRecommendation(userId, {
              type: 'product_selected',
              items: [chosen],
              context: { ...contextObj, selected_index: selIndex },
              sessionId: persistSessionId
            });
          } catch (e) {
            console.warn('[handleChat] saveRecommendation failed (product select)', e);
          }

          return res.json({
            success: true,
            message: `Đây là chi tiết mẫu ${selIndex} bạn chọn nè 😊`,
            selected: chosen,
            sessionId: persistSessionId
          });
        }

        // === NHÁNH THỨ 2: Phụ kiện (accessory) ===
        const parsed = parseRecommendationItems(lastRec.items);
        const accessoryList = extractAccessoryList(parsed, lastRec.context);

        if (Array.isArray(accessoryList) && accessoryList.length > 0) {
          if (selIndex > accessoryList.length) {
            return res.json({
              success: true,
              message: `Chỉ có ${accessoryList.length} mẫu phụ kiện thôi ạ!`,
              sessionId: session_id || lastRec.session_id
            });
          }

          const chosen = accessoryList[selIndex - 1];

          // Lưu chat + recommendation
          const persistSessionId = session_id || lastRec.session_id;
          try {
            await aiService.saveChatMessage(userId, { sessionId: persistSessionId, role: 'user', content: message || `Mẫu ${selIndex}` });
            await aiService.saveChatMessage(userId, {
              sessionId: persistSessionId,
              role: 'assistant',
              content: `Mình đã chọn mẫu ${selIndex} cho bạn.`,
              metadata: { action: 'accessory_selected', selected: chosen }
            });
            await aiService.saveRecommendation(userId, {
              type: 'accessory',
              items: [chosen],
              context: contextObj,
              sessionId: persistSessionId
            });
          } catch (e) { /* non-fatal */ }

          return res.json({
            success: true,
            message: `Mình đã chọn mẫu ${selIndex} cho bạn.`,
            selected: chosen,
            sessionId: persistSessionId
          });
        }

        // === NHÁNH THỨ 3: Outfit ===
        if (Array.isArray(parsed.outfits) && parsed.outfits.length >= selIndex) {
          try {
            const result = await aiService.handleOutfitSelection(userId, session_id || lastRec.session_id, selIndex);
            return res.json({
              success: true,
              message: result.reply || `Đây là chi tiết bộ outfit mẫu ${selIndex} nè!`,
              selected: result.selected || result.outfit,
              sessionId: result.sessionId || session_id
            });
          } catch (e) {
            console.error('[handleChat] handleOutfitSelection error', e);
          }
        }

        // === FALLBACK: Không xác định được danh sách nào ===
        return res.json({
          success: true,
          message: 'Mình không thấy danh sách mẫu nào gần đây. Bạn nói rõ hơn hoặc nói "xem thêm" để mình gợi ý lại nha!',
          sessionId: session_id || lastRec.session_id
        });

      } catch (err) {
        console.error('[handleChat] select branch error', err);
        return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!' });
      }
    }
    if (intent.type === 'more') {
      try {
        const lastRec = typeof aiService.getLastRecommendationForUser === 'function' 
          ? await aiService.getLastRecommendationForUser(userId) 
          : null;

        // Debug log
        try {
          console.debug('[aiRecommendationController.more] lastRec preview', {
            lastRecId: lastRec?.id || null,
            lastRecSession: lastRec?.session_id || null,
            lastRecContext: lastRec?.context ? (typeof lastRec.context === 'string' ? String(lastRec.context).slice(0,300) : JSON.stringify(lastRec.context).slice(0,300)) : null,
            lastRecItemsPreview: lastRec?.items ? (typeof lastRec.items === 'string' ? String(lastRec.items).slice(0,300) : JSON.stringify(lastRec.items).slice(0,300)) : null
          });
        } catch (e) { /* ignore logging errors */ }

        // Build excludeVariantIds từ TẤT CẢ outfits (chỉ đúng cho outfit flow)
        // Điều này không work cho product_search vì products không nằm trong outfits array
        const excludeVariantIds = [];
        if (lastRec && lastRec.items) {
          let raw = lastRec.items;
          if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch (e) { /* keep raw string */ }
          }

          // VẤN ĐỀ: chỉ lấy từ parsed.outfits, không lấy từ parsed.products
          if (raw && typeof raw === 'object' && Array.isArray(raw.excluded)) {
            excludeVariantIds.push(...raw.excluded.filter(Boolean));
          } else {
            const parsed = parseRecommendationItems(raw);
            if (Array.isArray(parsed.outfits) && parsed.outfits.length) {
              for (const o of parsed.outfits) {
                if (Array.isArray(o.items)) excludeVariantIds.push(...o.items.map(i => (typeof i === 'string') ? i : (i && (i.variant_id || i.id) ? (i.variant_id || i.id) : null)).filter(Boolean));
              }
            } else if (Array.isArray(parsed.items) && parsed.items.length) {
              parsed.items.forEach(it => {
                if (typeof it === 'string') excludeVariantIds.push(it);
                else if (it && (it.variant_id || it.id)) excludeVariantIds.push(it.variant_id || it.id);
              });
            }
          }
        }

        // Persist user message for history
        const persistSessionId = session_id || (lastRec && lastRec.session_id) || null;
        if (persistSessionId && (message && String(message).trim())) {
          try {
            const chatPayload = { sessionId: persistSessionId, role: 'user', content: String(message).trim() };
            if (typeof aiService.saveChatMessage === 'function') {
              await aiService.saveChatMessage(userId, chatPayload);
              console.debug('[aiRecommendationController.more] saveChatMessage OK', { sessionId: persistSessionId });
            } else if (typeof aiService.appendChatMessage === 'function') {
              await aiService.appendChatMessage(userId, chatPayload);
            }
          } catch (e) {
            console.error('[aiRecommendationController.more] persist user message failed', e && e.stack ? e.stack : e);
          }
        }

        // 🆕 THÊM: Detect product_search path
        let isProductSearchPath = false;
        let lastSearchQuery = null;

        if (lastRec) {
          let contextObj = lastRec.context;
          if (typeof contextObj === 'string') {
            try { contextObj = JSON.parse(contextObj); } catch (e) { contextObj = {}; }
          }

          // Check if last recommendation was product_search
          if (contextObj?.type === 'product_search' || contextObj?.action === 'product_search') {
            isProductSearchPath = true;
            lastSearchQuery = contextObj?.query || null;
            console.debug('[aiRecommendationController.more] product_search path detected', { lastSearchQuery });
          }
        }

        // ─────────────────────────────────────────────────────────────────
        // 🆕 BRANCH 1: Product Search "Xem thêm" 
        // ─────────────────────────────────────────────────────────────────
        if (isProductSearchPath && lastSearchQuery) {
          try {
            const excludeVariantsForSearch = [];
            if (lastRec && lastRec.items) {
              let raw = lastRec.items;
              if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch (e) { raw = null; }
              }

              //Extract từ .products array (đây là key cho product_search)
              if (raw && Array.isArray(raw.products)) {
                excludeVariantsForSearch.push(
                  ...raw.products.map(p => String(p.variant_id || p.id)).filter(Boolean)
                );
              }
              // Fallback: nếu products không có, fallback về items (compatibility)
              else if (raw && Array.isArray(raw.items)) {
                excludeVariantsForSearch.push(
                  ...raw.items.map(p => String(p.variant_id || p.id)).filter(Boolean)
                );
              }
            }

            console.debug('[aiRecommendationController.more] calling searchProducts with exclusions', { 
              query: lastSearchQuery, 
              excludeCount: excludeVariantsForSearch.length  //dùng excludeVariantsForSearch thay vì excludeVariantIds
            });

            const searchRes = await aiService.searchProducts(userId, lastSearchQuery, {
              sessionId: persistSessionId,
              limit: 6,
              excludeVariantIds: excludeVariantsForSearch  //truyền đúng list
            });

            if (!searchRes) {
              console.error('[aiRecommendationController.more] searchProducts returned empty (product_search more)');
              return res.status(500).json({ success: false, message: 'Luna đang tìm sản phẩm, thử lại sau nha!' });
            }

            // Persist search recommendation
            try {
              await aiService.saveRecommendation(userId, {
                type: 'product_search',
                items: searchRes.products || [],
                context: { query: lastSearchQuery, type: 'product_search' },
                sessionId: persistSessionId
              });
            } catch (e) {
              console.warn('[aiRecommendationController.more] save product_search recommendation failed', e);
            }

            return res.json({
              success: true,
              message: searchRes.reply || 'Mình tìm thêm vài mẫu khác cho bạn nè.',
              data: searchRes.products || [],
              followUp: searchRes.followUp || null,
              sessionId: searchRes.sessionId || persistSessionId
            });
          } catch (err) {
            console.error('[aiRecommendationController.more] searchProducts error (product_search more)', err && err.stack ? err.stack : err);
            // fallthrough to accessory/outfit branches
          }
        }

        // ─────────────────────────────────────────────────────────────────
        // BRANCH 2: Accessory "Xem thêm" (existing)
        // ─────────────────────────────────────────────────────────────────
        let isAccessoryPath = false;
        try {
          if (lastRec) {
            const rawItems = lastRec.items;
            const parsed = parseRecommendationItems(rawItems);
            const accessoryList = extractAccessoryList(parsed, lastRec.context);
            if (Array.isArray(accessoryList) && accessoryList.length > 0) isAccessoryPath = true;

            let ctx = lastRec.context;
            if (typeof ctx === 'string') {
              try { ctx = JSON.parse(ctx); } catch (e) { /* keep string */ }
            }
            const action = ctx && (ctx.action || ctx.type || ctx.type_name || '');
            if (action && typeof action === 'string') {
              const a = action.toLowerCase();
              if (a.includes('accessory') || a.includes('phụ kiện') || a.includes('reject')) isAccessoryPath = true;
            }
          }
        } catch (e) { /* ignore */ }

        if (isAccessoryPath) {
          try {

            const excludeVariantsForAccessory = [];
            if (lastRec && lastRec.items) {
              let raw = lastRec.items;
              if (typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch (e) { raw = null; }
              }

              // ✅ Extract từ .accessories array (đây là key cho accessory response)
              if (raw && Array.isArray(raw.accessories)) {
                excludeVariantsForAccessory.push(
                  ...raw.accessories.map(a => String(a.variant_id || a.id)).filter(Boolean)
                );
              }
              // Fallback: nếu accessories không có, fallback về items (compatibility)
              else if (raw && Array.isArray(raw.items)) {
                excludeVariantsForAccessory.push(
                  ...raw.items.map(a => String(a.variant_id || a.id)).filter(Boolean)
                );
              }
            }

            console.debug('[aiRecommendationController.more] calling suggestAccessories with exclusions', { 
              query: message,
              excludeCount: excludeVariantsForAccessory.length  //dùng excludeVariantsForAccessory
            });

            const accRes = await aiService.suggestAccessories(userId, message || 'Gợi ý thêm mẫu khác', {
              sessionId: persistSessionId,
              excludeVariantIds: excludeVariantsForAccessory, //truyền đúng list
              max: 6
            });

            if (!accRes) {
              console.error('[aiRecommendationController.more] suggestAccessories returned empty');
              return res.status(500).json({ success: false, message: 'Luna đang bận chọn phụ kiện, thử lại sau nha!' });
            }

            if (accRes.ask) {
              const askMessage = (typeof accRes.ask === 'string') ? accRes.ask : (accRes.ask && accRes.ask.prompt) ? accRes.ask.prompt : null;
              const payload = {
                success: true,
                message: accRes.reply || askMessage || 'Mình cần hỏi thêm một chút để gợi ý chính xác hơn.',
                sessionId: accRes.sessionId || persistSessionId
              };
              if (typeof accRes.ask !== 'boolean') payload.ask = accRes.ask;
              return res.json(payload);
            }

            return res.json({
              success: true,
              message: accRes.reply || 'Mình đã tìm thêm vài mẫu cho bạn.',
              data: accRes.accessories || accRes.data || [],
              followUp: accRes.followUp || null,
              sessionId: accRes.sessionId || persistSessionId
            });
          } catch (e) {
            console.error('[aiRecommendationController.more] suggestAccessories error', e && e.stack ? e.stack : e);
            // fallthrough to outfit
          }
        }

        // ─────────────────────────────────────────────────────────────────
        // BRANCH 3: Outfit "Xem thêm" (existing - fallback)
        // ─────────────────────────────────────────────────────────────────
        let occasionFromContext = null;
        let weatherFromContext = null;
        if (lastRec && lastRec.context) {
          try {
            const ctx = typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context;
            occasionFromContext = ctx && ctx.occasion ? ctx.occasion : null;
            weatherFromContext = ctx && ctx.weather ? ctx.weather : null;
          } catch (e) { /* ignore */ }
        }

        const moreRes = await aiService.generateOutfitRecommendation(userId, occasionFromContext, weatherFromContext, {
          productId: product_id,
          variantId: variant_id,
          sessionId: persistSessionId || null,
          more: true,
          excludeVariantIds,
          maxOutfits: 1
        });

        if (!moreRes) {
          console.error('[aiRecommendationController.more] generateOutfitRecommendation returned empty');
          return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
        }

        if (moreRes.ask) {
          const askMessage = (typeof moreRes.ask === 'string') ? moreRes.ask : (moreRes.ask && moreRes.ask.prompt) ? moreRes.ask.prompt : null;
          const payload = {
            success: true,
            message: moreRes.reply || askMessage || 'Mình cần hỏi thêm một chút để gợi ý chính xác hơn.'
          };
          if (typeof moreRes.ask !== 'boolean') payload.ask = moreRes.ask;
          return res.json(payload);
        }
        return res.json({
          success: true,
          message: moreRes.reply || 'Mình đã tìm thêm vài set khác cho bạn.',
          data: moreRes.outfits || [],
          followUp: moreRes.followUp || null,
          sessionId: moreRes.sessionId || null
        });
      } catch (err) {
        console.error('[aiRecommendationController.more] unexpected error', err && err.stack ? err.stack : err);
        return res.status(500).json({ success: false, message: 'Luna đang bận, thử lại sau nha!' });
      }
    }

    const lowerMessage = (message || '').toLowerCase();
    let lastRec = null;
    try {
      lastRec = typeof aiService.getLastRecommendationForUser === 'function' ? await aiService.getLastRecommendationForUser(userId) : null;
    } catch (e) {
      console.error('[aiRecommendationController.handleChat] load lastRec failed', e && e.stack ? e.stack : e);
      lastRec = null;
    }

    if(/(túi|ví|kính|phụ kiện|bag|wallet|sunglass)/i.test(lowerMessage)){
      if (process.env.DEBUG_AI_SERVICE) console.debug('[aiRecommendationController.handleChat.DEBUG] accessory intent detected in controller (regex matched)', { lowerMessage });
      try {
        const accRes = await aiService.suggestAccessories(userId, message, {
          sessionId: session_id || null,
          //truyền thêm context để tận dụng gender, occasion, weather nếu có
          context: lastRec?.context ? (typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context) : null
        });

        if (process.env.DEBUG_AI_SERVICE) {
          console.debug('[aiRecommendationController.handleChat.DEBUG] suggestAccessories returned (preview):', {
            reply: accRes?.reply ? String(accRes.reply).slice(0,400) : null,
            accessoriesCount: Array.isArray(accRes?.accessories) ? accRes.accessories.length : (Array.isArray(accRes?.data) ? accRes.data.length : 0),
            sessionId: accRes?.sessionId || session_id || null,
            keys: accRes ? Object.keys(accRes) : null
          });
        }

        //lưu luôn vào ai_recommendations giống như outfit
        if(accRes && (Array.isArray(accRes.accessories) ? accRes.accessories.length > 0 : (Array.isArray(accRes.data) ? accRes.data.length > 0 : false))){
          await aiService.saveRecommendation(userId, {
            type: 'accessory',
            items: accRes.accessories || accRes.data || [],
            context: { occasion, weather, message },
            sessionId: session_id || null
          });
        }

        // in other suggestAccessories branch (non-"more") add handling if accRes.ask present
        if (accRes && accRes.ask) {
          const askMessage = (typeof accRes.ask === 'string') ? accRes.ask : (accRes.ask && accRes.ask.prompt) ? accRes.ask.prompt : null;
          const payload = {
            success: true,
            message: accRes.reply || askMessage || 'Mình cần hỏi thêm một chút để gợi ý chính xác hơn.',
            sessionId: accRes?.sessionId || session_id
          };
          if (typeof accRes.ask !== 'boolean') payload.ask = accRes.ask;
          return res.json(payload);
        }

        return res.json({
          success: true,
          message: accRes?.reply || '',
          data: accRes?.data || accRes?.accessories || [],
          followUp: accRes?.followUp || null,
          sessionId: accRes?.sessionId || session_id
        });
      }catch (err) {
        console.error('[handleChat] suggestAccessories error', err);
        return res.status(500).json({ success: false, message: 'Luna đang chọn túi, thử lại sau nha!' });
      }
    }

    // default: xử lý câu hỏi chung 
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

      if (result.ask) {
        const payload = { success: true, sessionId: result.sessionId || null };
        if (typeof result.ask !== 'boolean') payload.ask = result.ask;
        if (result.reply) payload.message = result.reply;
        return res.json(payload);
      }
      return res.json({
        success: true,
        type: result.type || 'info',
        message: result.reply || '',
        data: result.data || result.outfits || [],
        sizeSuggestions: result.sizeSuggestions || null,
        followUp: result.followUp || null, 
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