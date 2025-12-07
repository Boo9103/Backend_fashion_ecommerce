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

  // heuristic to detect accessory-like item
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

    const intent = typeof detectSimpleIntent === 'function' ? detectSimpleIntent(message) : { type: 'default' };
console.debug('[aiRecommendationController.handleChat] detected intent:', intent);
    if (intent.type === 'select') {
      try {
        const selIndex = Number.isFinite(intent.index) ? intent.index : null;

        // load last recommendation
        let lastRec = null;
        try { lastRec = typeof aiService.getLastRecommendationForUser === 'function' ? await aiService.getLastRecommendationForUser(userId) : null; } catch(e) {
          console.error('[aiRecommendationController.handleChat] getLastRecommendationForUser failed (select)', e && e.stack ? e.stack : e);
          lastRec = null;
        }

        // debug summary
        try {
          console.debug('[aiRecommendationController.handleChat] select branch debug', {
            userId,
            session_id,
            selIndex,
            lastRecId: lastRec?.id || null,
            lastRecSession: lastRec?.session_id || null,
            lastRecItemsType: typeof lastRec?.items,
            lastRecItemsPreview: Array.isArray(lastRec?.items) ? `array(${lastRec.items.length})` : (lastRec?.items ? 'object/string' : null)
          });
        } catch (e) { /* ignore */ }

        if (!selIndex) {
          return res.status(400).json({ success: false, message: 'Chọn mẫu không hợp lệ.' });
        }

        if (lastRec) {
          // parse items safely and expose for debug
          const parsed = parseRecommendationItems(lastRec.items);
          console.debug('[aiRecommendationController.handleChat] parsed recommendation shape', {
            accessoriesCount: Array.isArray(parsed.accessories) ? parsed.accessories.length : 0,
            outfitsCount: Array.isArray(parsed.outfits) ? parsed.outfits.length : 0,
            itemsCount: Array.isArray(parsed.items) ? parsed.items.length : 0
          });

          // build accessory list robustly (use parsed.accessories or fallback to parsed.items)
          const accessoryList = extractAccessoryList(parsed, lastRec.context);
          console.debug('[aiRecommendationController.handleChat] accessoryList length', { accessoryListLen: Array.isArray(accessoryList) ? accessoryList.length : 0 });

          // accessory selection path
          if (Array.isArray(accessoryList) && accessoryList.length > 0) {
            if (selIndex <= 0 || selIndex > accessoryList.length) {
              console.debug('[aiRecommendationController.handleChat] accessory select index out of range', { selIndex, accessoriesLen: accessoryList.length });
              return res.status(400).json({ success: false, message: `Mẫu ${selIndex} không tồn tại.` });
            }

            const chosen = accessoryList[selIndex - 1];
            console.debug('[aiRecommendationController.handleChat] accessory selection chosen preview', {
              chosenId: (chosen && (chosen.variant_id || chosen.id)) ? (chosen.variant_id || chosen.id) : null,
              chosenType: typeof chosen
            });

            // persist user's selection and log result
            try {
              const saveRes = await aiService.saveRecommendation(userId, {
                type: 'accessory',
                items: [chosen],
                context: lastRec.context ? (typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context) : null,
                sessionId: session_id || lastRec.session_id || null
              });
              console.debug('[aiRecommendationController.handleChat] saveRecommendation result', saveRes);

              // ALSO persist the user's chat message so conversation shows "Mẫu 1"
              try {
                const chatPayload = {
                  sessionId: session_id || lastRec.session_id || null,
                  role: 'user',
                  content: message || `Mẫu ${selIndex}`
                };
                if (typeof aiService.saveChatMessage === 'function') {
                  await aiService.saveChatMessage(userId, chatPayload);
                  console.debug('[aiRecommendationController.handleChat] saveChatMessage OK', { sessionId: chatPayload.sessionId });
                } else if (typeof aiService.appendChatMessage === 'function') {
                  // fallback to alternative name
                  await aiService.appendChatMessage(userId, chatPayload);
                  console.debug('[aiRecommendationController.handleChat] appendChatMessage OK', { sessionId: chatPayload.sessionId });
                } else {
                  console.debug('[aiRecommendationController.handleChat] no chat-save function available on aiService; skipping chat persist');
                }
              } catch (e) {
                console.error('[aiRecommendationController.handleChat] saving user chat message failed', e && e.stack ? e.stack : e);
              }

              // Persist assistant reply so conversation/history shows "Mình đã chọn mẫu X cho bạn."
              try {
                const assistantPayload = {
                  sessionId: session_id || lastRec.session_id || null,
                  role: 'assistant',
                  content: `Mình đã chọn mẫu ${selIndex} cho bạn.`,
                  metadata: { action: 'accessory_selected', selected: chosen }
                };
                if (typeof aiService.saveChatMessage === 'function') {
                  await aiService.saveChatMessage(userId, assistantPayload);
                  console.debug('[aiRecommendationController.handleChat] saved assistant chat message', { sessionId: assistantPayload.sessionId });
                } else if (typeof aiService.appendChatMessage === 'function') {
                  await aiService.appendChatMessage(userId, assistantPayload);
                  console.debug('[aiRecommendationController.handleChat] appended assistant chat message', { sessionId: assistantPayload.sessionId });
                } else {
                  console.debug('[aiRecommendationController.handleChat] no chat-save function available on aiService; skipping assistant persist');
                }
              } catch (e) {
                console.error('[aiRecommendationController.handleChat] saving assistant chat message failed', e && e.stack ? e.stack : e);
              }
            } catch (e) {
              console.error('[aiRecommendationController.handleChat] saveRecommendation (accessory select) threw', e && e.stack ? e.stack : e);
            }

            // respond with selected accessory
            return res.json({
              success: true,
              message: `Mình đã chọn mẫu ${selIndex} cho bạn.`,
              selected: chosen,
              sessionId: session_id || lastRec.session_id || null
            });
          }

          // outfit-selection path (if accessories not present)
          if (Array.isArray(parsed.outfits) && parsed.outfits.length >= selIndex && selIndex > 0) {
            try {
              const sel = await aiService.handleOutfitSelection(userId, session_id || lastRec.session_id || null, selIndex);
              if (sel.ask) return res.json({ success: true, ask: sel.ask, selected: sel.selected || null, sessionId: sel.sessionId || null });
              return res.json({ success: true, message: sel.reply || '', selected: sel.selected || null, sessionId: sel.sessionId || null });
            } catch (e) {
              console.error('[aiRecommendationController.handleChat] handleOutfitSelection threw', e && e.stack ? e.stack : e);
              return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
            }
          }

          // no accessories/outfits detected
          console.debug('[aiRecommendationController.handleChat] no accessories or outfits found in lastRec for select', { lastRecId: lastRec.id });
        }

        // fallback delegate to service generic outfit selection as last resort
        try {
          const sel = await aiService.handleOutfitSelection(userId, session_id || null, intent.index);
          if (sel.ask) return res.json({ success: true, ask: sel.ask, selected: sel.selected || null, sessionId: sel.sessionId || null });
          return res.json({ success: true, message: sel.reply || '', selected: sel.selected || null, sessionId: sel.sessionId || null });
        } catch (err) {
          console.error('[aiRecommendationController.handleChat] fallback handleOutfitSelection error', err && err.stack ? err.stack : err);
          return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
        }
      } catch (err) {
        console.error('[aiRecommendationController.handleChat] select branch unexpected error', err && err.stack ? err.stack : err);
        return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
      }
    }

    if (intent.type === 'more') {
      try {
        // Load last recommendation (use service helper) and reuse its context (occasion/weather)
        const lastRec = typeof aiService.getLastRecommendationForUser === 'function' ? await aiService.getLastRecommendationForUser(userId) : null;

        // Debug: always log lastRec shape so we can see why branch chosen
        try {
          console.debug('[aiRecommendationController.more] lastRec preview', {
            lastRecId: lastRec?.id || null,
            lastRecSession: lastRec?.session_id || null,
            lastRecContext: lastRec?.context ? (typeof lastRec.context === 'string' ? String(lastRec.context).slice(0,300) : JSON.stringify(lastRec.context).slice(0,300)) : null,
            lastRecItemsPreview: lastRec?.items ? (typeof lastRec.items === 'string' ? String(lastRec.items).slice(0,300) : JSON.stringify(lastRec.items).slice(0,300)) : null
          });
        } catch (e) { /* ignore logging errors */ }

        // build excludeVariantIds from lastRec (support legacy arrays, outfits, items, or { excluded: [...] } shape)
        const excludeVariantIds = [];
        if (lastRec && lastRec.items) {
          let raw = lastRec.items;
          if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch (e) { /* keep raw string */ }
          }

          // If object contains "excluded" array (seen in logs), use it
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

        // decide accessory vs outfit path using robust helper (also consider context.action)
        let isAccessoryPath = false;
        try {
          if (lastRec) {
            const rawItems = lastRec.items;
            const parsed = parseRecommendationItems(rawItems);
            const accessoryList = extractAccessoryList(parsed, lastRec.context);
            if (Array.isArray(accessoryList) && accessoryList.length > 0) isAccessoryPath = true;

            // parse context and check action-based hints (e.g. accessory_reject_all)
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
        } catch (e) { /* ignore parse errors */ }

        console.debug('[aiRecommendationController.more] reuse context', { occasionFromContext: null, weatherFromContext: null, excludeCount: excludeVariantIds.length, isAccessoryPath });

        // Persist user message for history regardless (best-effort)
        const persistSessionId = session_id || (lastRec && lastRec.session_id) || null;
        if (persistSessionId && (message && String(message).trim())) {
          try {
            const chatPayload = { sessionId: persistSessionId, role: 'user', content: String(message).trim() };
            if (typeof aiService.saveChatMessage === 'function') {
              await aiService.saveChatMessage(userId, chatPayload);
              console.debug('[aiRecommendationController.more] saveChatMessage OK', { sessionId: persistSessionId });
            } else if (typeof aiService.appendChatMessage === 'function') {
              await aiService.appendChatMessage(userId, chatPayload);
              console.debug('[aiRecommendationController.more] appendChatMessage OK', { sessionId: persistSessionId });
            } else {
              console.debug('[aiRecommendationController.more] no chat-save function available on aiService; skipping chat persist');
            }
          } catch (e) {
            console.error('[aiRecommendationController.more] persist incoming "more" user message failed', e && e.stack ? e.stack : e);
          }
        }

        // If accessory path -> call suggestAccessories (so accessory flow + persistence is used)
        if (isAccessoryPath) {
          try {
            const accRes = await aiService.suggestAccessories(userId, message || 'Gợi ý thêm mẫu khác', {
              sessionId: persistSessionId,
              excludeVariantIds,
              max: 6
            });

            if (!accRes) {
              console.error('[aiRecommendationController.handleChat] suggestAccessories returned empty (more/accessory)');
              return res.status(500).json({ success: false, message: 'Luna đang bận chọn phụ kiện, thử lại sau nha!' });
            }
            if (accRes.ask) {
              const askMessage = (typeof accRes.ask === 'string') ? accRes.ask : (accRes.ask && accRes.ask.prompt) ? accRes.ask.prompt : null;
              const payload = {
                success: true,
                message: accRes.reply || askMessage || 'Mình cần hỏi thêm một chút để gợi ý chính xác hơn.',
                sessionId: accRes.sessionId || persistSessionId
              };
              // only include ask if it's not a plain boolean true
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
            console.error('[aiRecommendationController.handleChat] suggestAccessories (more) error', e && e.stack ? e.stack : e);
            // fallback to outfit flow below
          }
        }

        // Fallback: reuse last recommendation context for outfit generation
        let occasionFromContext = null;
        let weatherFromContext = null;
        if (lastRec && lastRec.context) {
          try {
            const ctx = typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context;
            occasionFromContext = ctx && ctx.occasion ? ctx.occasion : null;
            weatherFromContext = ctx && ctx.weather ? ctx.weather : null;
          } catch (e) { /* ignore parse errors */ }
        }

        // IMPORTANT: do NOT forward the "more" user message to generator (may trigger parser to ask)
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
        console.error('[aiRecommendationController.handleChat] generateOutfitRecommendation (more) error', err && err.stack ? err.stack : err);
        return res.status(500).json({ success: false, message: 'Luna đang bận thử đồ, thử lại sau nha!' });
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

    if(/(túi|ví|kính|thắt lưng|phụ kiện|bag|wallet|sunglass|belt)/i.test(lowerMessage)){
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