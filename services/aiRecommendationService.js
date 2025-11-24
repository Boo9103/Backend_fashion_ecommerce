const pool = require('../config/db');
const openai = require('../utils/openai'); // adjust import if your project has different openai wrapper

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// simple in-memory products cache used by generateOutfitRecommendation
const productsCache = { data: [], timestamp: 0 };
// TTL in ms (default 10 minutes)
const CACHE_TTL = parseInt(process.env.PRODUCTS_CACHE_TTL_MS || '600000', 10);

//lấy thông tin user + hành vi để gợi ý trang phục từ AI
exports.getUserProfileAndBehavior = async (userId) => {
    const client = await pool.connect();
    try {
        // basic user info
        const uRes = await client.query(`SELECT id, full_name, name, phone FROM users WHERE id = $1 LIMIT 1`, [userId]);
        if (uRes.rows.length === 0) return null;
        const user = uRes.rows[0];

        // favorites (may be table name 'favorite' in your schema)
        const favRes = await client.query(`
            SELECT COALESCE(json_agg(jsonb_build_object('product_id', product_id, 'created_at', created_at)), '[]'::json) AS favorite_products
            FROM favorite
            WHERE user_id = $1 AND product_id IS NOT NULL
        `, [userId]);

        // purchased products from paid orders
        const purchasedRes = await client.query(`
            SELECT COALESCE(json_agg(jsonb_build_object('variant_id', oi.variant_id::text, 'product_name', oi.name_snapshot, 'bought_at', o.created_at)), '[]'::json) AS purchased_products
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.user_id = $1 AND o.payment_status = 'paid' AND oi.variant_id IS NOT NULL
        `, [userId]);

        // behavior events
        const eventsRes = await client.query(`
            SELECT COALESCE(json_agg(jsonb_build_object('event_type', event_type, 'metadata', metadata, 'created_at', created_at)), '[]'::json) AS behavior_events
            FROM user_behavior_events
            WHERE user_id = $1 AND event_type IS NOT NULL
        `, [userId]);

        return {
            ...user,
            favorite_products: favRes.rows[0].favorite_products || [],
            purchased_products: purchasedRes.rows[0].purchased_products || [],
            behavior_events: eventsRes.rows[0].behavior_events || []
        };
    } finally {
        client.release();
    }
};

// new: start or resume chat session when user opens chatbox
exports.startChatSession = async (userId, providedSessionId = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) If caller provided a session_id, try to resume it (validate ownership)
    if (providedSessionId) {
      const sRes = await client.query(
        `SELECT id FROM ai_chat_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [providedSessionId, userId]
      );
      if (sRes.rowCount > 0) {
        const msgs = await client.query(
          `SELECT role, content, created_at FROM ai_chat_messages WHERE session_id = $1 ORDER BY created_at`,
          [providedSessionId]
        );
        await client.query('COMMIT');
        return { sessionId: providedSessionId, messages: msgs.rows, isNew: false, sessionExpired: false };
      }
      // providedSessionId invalid -> fallthrough to create/resume default below
    }

    // 2) Persistent-per-user strategy:
    // If user already has an existing session, reuse it so FE can keep a single permanent ssid.
    const existingRes = await client.query(
      `SELECT id FROM ai_chat_sessions WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 1`,
      [userId]
    );
    if (existingRes.rowCount > 0) {
      const sessionId = existingRes.rows[0].id;
      const msgs = await client.query(
        `SELECT role, content, created_at FROM ai_chat_messages WHERE session_id = $1 ORDER BY created_at`,
        [sessionId]
      );
      await client.query('COMMIT');
      return { sessionId, messages: msgs.rows, isNew: false, sessionExpired: false };
    }

    // 3) No existing session -> create a new persistent session for this user
    const sIns = await client.query(
      `INSERT INTO ai_chat_sessions (user_id, context, started_at, last_message_at)
       VALUES ($1, '{}'::jsonb, NOW(), NOW()) RETURNING id`,
      [userId]
    );
    const sessionId = sIns.rows[0].id;

    // personalized welcome
    const uQ = await client.query(`SELECT full_name FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const name = (uQ.rows[0] && uQ.rows[0].full_name) ? uQ.rows[0].full_name.split(' ').pop() : 'bạn';
    const welcome = `Chào ${name}! Mình là Luna đây 😊 Bạn muốn mình gợi ý outfit cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?`;

    await client.query(
      `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'assistant', $2, NOW())`,
      [sessionId, welcome]
    );

    await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);

    await client.query('COMMIT');
    return { sessionId, messages: [{ role: 'assistant', content: welcome, created_at: new Date() }], isNew: true, sessionExpired: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// helper: find best size label from size_guides based on user measurements and category_id
const pickSizeFromGuides = (guides, measurements) => {
  if (!guides || !guides.length || !measurements) return null;
  const h = Number(measurements.height || 0);
  const w = Number(measurements.weight || 0);
  for (const g of guides) {
    const minH = g.min_height || -Infinity;
    const maxH = g.max_height || Infinity;
    const minW = g.min_weight || -Infinity;
    const maxW = g.max_weight || Infinity;
    if (h >= minH && h <= maxH && w >= minW && w <= maxW) return g.size_label;
  }
  // fallback: return nearest by height difference
  guides.sort((a,b) => Math.abs((a.min_height||0) - h) - Math.abs((b.min_height||0) - h));
  return guides[0] ? guides[0].size_label : null;
};


// modified: generateOutfitRecommendation to include OpenAI generation (with DB-only constraint)
exports.generateOutfitRecommendation = async (userId, occasion, weather, opts = {}) => {
  console.debug('[aiService.generateOutfitRecommendation] called', {
    userId: String(userId),
    occasion: occasion || null,
    weather: weather || null,
    optsMessagePreview: String(opts.message || '').slice(0, 200),
    optsMaxOutfits: opts.maxOutfits || null,
    optsExcludeCount: Array.isArray(opts.excludeVariantIds) ? opts.excludeVariantIds.length : 0
  });
  if ((!occasion || !weather) && opts.message) {
    const ruleSlots = extractSlotsFromMessage(opts.message || '');
    // prefer explicit provided values; fill missing from rules
    occasion = occasion || ruleSlots.occasion || null;
    weather = weather || ruleSlots.weather || null;
    // attach inferred style/gender to opts for downstream use
    opts.inferredStyle = opts.inferredStyle || ruleSlots.style || null;
    opts.inferredGender = opts.inferredGender || ruleSlots.gender || null;
    opts.inferredWantsAccessories = opts.inferredWantsAccessories || false;

    // if still missing core slots (occasion or weather), try AI parsing fallback (low-cost)
    if ((!occasion || !weather) && openai) {
      const aiParsed = await parseWithOpenAI(opts.message);
      if (aiParsed) {
        occasion = occasion || aiParsed.occasion || null;
        weather = weather || aiParsed.weather || null;
        opts.inferredStyle = opts.inferredStyle || aiParsed.style || null;
        opts.inferredGender = opts.inferredGender || aiParsed.gender || null;
        opts.inferredWantsAccessories = opts.inferredWantsAccessories || aiParsed.wantsAccessories || false;
      }
    }
  }

  // After automatic extraction, if still missing required slots -> ask
  // If occasion missing -> ask user to clarify.
  if (!occasion) {
    return { ask: 'Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?' };
  }

  // If weather missing but occasion is present -> assume a sensible default to reduce back-and-forth.
  // You can change the default string or make it configurable.
  if (!weather) {
    weather = 'mát mẻ, dễ chịu'; 
  }

  // if wants accessories but no gender -> ask for gender
  if ((opts.inferredWantsAccessories || /phụ kiện|túi|ví|kính|jewelry|vòng|dây chuyền|belt/i.test(String(opts.message||''))) && !opts.inferredGender && !opts.gender) {
    return { ask: 'Bạn là nam hay nữ để mình chọn phụ kiện phù hợp?' };
  }

  const client = await pool.connect();
  try {
    // Do reads and remote LLM calls WITHOUT holding a DB transaction to avoid locking while waiting.
    let txStarted = false; // set to true only when we deliberately begin a transaction before persisting results

    // persist user message (single-statement autocommit) so session history is up-to-date for AI context.
    // Do NOT start a multi-statement DB transaction here to avoid holding locks while waiting for LLM.
    if (opts.sessionId && opts.message) {
      const userMsg = String(opts.message || '').trim();
      if (userMsg.length > 0) {
        try {
          await client.query(
            `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'user', $2, NOW())`,
            [opts.sessionId, userMsg]
          );
          await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [opts.sessionId]);
        } catch (e) {
          // non-fatal: log and continue (we still want to call LLM)
          console.error('[aiService.generateOutfitRecommendation] failed to persist user message (autocommit):', e && e.stack ? e.stack : e);
        }
      }
    }

    // fetch user + measurements (sequential because needed)
    const userQ = await client.query(`SELECT id, full_name, phone, height, weight, bust, waist, hip FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const user = userQ.rows[0];
    if (!user) throw new Error("User not found");

    // prepare products query (same as before)
    const prodSql = `
      SELECT p.id AS product_id, p.name, p.description, COALESCE(p.final_price, p.price)::integer as price,
             pv.id AS variant_id, pv.color_name, c.name as category_name, pv.stock_qty, p.category_id, pv.sizes
      FROM products p
      JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active' AND pv.stock_qty > 0
      LIMIT 300
    `;

    // Parallel fetch: favorites, purchased, products (with cache)
    const favoritesPromise = client.query(
      `SELECT p.id, p.name, p.category_id
       FROM favorite f
       JOIN products p ON f.product_id = p.id
       WHERE f.user_id = $1
       ORDER BY f.seq DESC LIMIT 10`,
      [userId]
    );

    const purchasedPromise = client.query(
      `SELECT DISTINCT p.id, p.name, pv.id AS variant_id, p.category_id
       FROM order_items oi
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1 AND o.payment_status = 'paid' LIMIT 10`,
      [userId]
    );

    const productsPromise = (async () => {
      if (productsCache.timestamp > Date.now() - CACHE_TTL && Array.isArray(productsCache.data)) {
        return { rows: productsCache.data };
      }
      const res = await client.query(prodSql);
      // cache snapshot of rows (shallow copy)
      productsCache.data = res.rows.slice();
      productsCache.timestamp = Date.now();
      return res;
    })();

    const [favoritesRes, purchasedRes, productsRes] = await Promise.all([favoritesPromise, purchasedPromise, productsPromise]);

    const favorites = favoritesRes.rows;
    const purchased = purchasedRes.rows;
    const products = productsRes.rows;

    // prefetch size_guides per category present (needs categoryIds from products)
    const categoryIds = Array.from(new Set(products.map(p => p.category_id).filter(Boolean)));
    const guidesByCategory = {};
    if (categoryIds.length) {
      const sgQ = await client.query(`SELECT id, category_id, size_label, min_height, max_height, min_weight, max_weight, bust, waist, hip FROM size_guides WHERE category_id = ANY($1::uuid[]) ORDER BY size_label`, [categoryIds]);
      for (const row of sgQ.rows) {
        guidesByCategory[row.category_id] = guidesByCategory[row.category_id] || [];
        guidesByCategory[row.category_id].push(row);
      }
    }

    // load session history if provided (last N)
    const sessionHistory = await loadSessionHistory(client, opts.sessionId, 60);

    // Build compactProducts as before
    const maxProductsForAI = 120;
    const excludedSet = new Set((opts.excludeVariantIds || []).map(v => String(v)));
    console.debug('[aiService] excludeVariantIds count:', excludedSet.size);
    console.debug('[aiService] total products fetched:', products.length);
    const filteredProducts = products.filter(p => !excludedSet.has(String(p.variant_id)));
    console.debug('[aiService] products after exclude filter:', filteredProducts.length);
    // shuffle to avoid always picking same top N variants (Fisher-Yates)
    for (let i = filteredProducts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = filteredProducts[i]; filteredProducts[i] = filteredProducts[j]; filteredProducts[j] = tmp;
    }
    const compactProducts = filteredProducts.slice(0, maxProductsForAI).map(p => ({
       variant_id: String(p.variant_id),
       product_id: String(p.product_id),
       name: p.name,
       category: p.category_name,
       color: p.color_name,
       sizes: p.sizes,
       stock: p.stock_qty,
       price: p.price
     }));

    const validVariants = new Set(compactProducts.map(p => String(p.variant_id)));

    // System prompt: persona + strict JSON schema + rules (IMPROVED)
    const systemPrompt = `
Bạn là "Luna" — Fashion Stylist AI thân thiện, xưng "Luna" hoặc "mình", gọi khách là "bạn"/"cậu". Giọng vui vẻ, nhẹ nhàng, dùng emoji tiết chế (ví dụ: 😊, 👍), KHÔNG lố. 

Mục tiêu: đưa ra gợi ý outfit CHÍNH XÁC từ danh sách "products" được cung cấp bên dưới. Tuyệt đối KHÔNG tạo sản phẩm/variant mới hoặc bịa variant_id. Mọi items trong output phải là variant_id tồn tại trong danh sách. Nếu AI chỉ có tên sản phẩm, server sẽ cố map tên -> variant_id; nếu không map được, bỏ item đó.

QUY TẮC TRẢ VỀ:
- Chỉ trả MỘT KHỐI JSON duy nhất theo schema (KHÔNG in thêm lời giải thích):
{
  "outfits":[
    {
      "name":"string (<=120 chars)",
      "description":"string (2-3 câu). Nêu fit/màu/chất liệu nếu có trong DB, gợi ý 1 phụ kiện phù hợp theo giới tính if requested, kết thúc bằng 1 CTA ngắn.",
      "items":["variant_uuid","..."],    // MỌI variant_uuid PHẢI xuất hiện trong products
      "why":"string (lý do ngắn, dựa trên hành vi khách, dịp, thời tiết, xu hướng)"
    }
  ]
}
- Mỗi description phải có 4-6 câu; kết thúc bằng 1 CTA (ví dụ: "Bạn muốn mình chọn size phù hợp?").
- Tối đa: ${opts.maxOutfits || 3} outfits.
- Nếu thiếu thông tin tối thiểu (occasion hoặc weather) -> trả {"ask":"<câu hỏi ngắn, thân thiện>"} và KHÔNG trả outfits.
- Nếu user yêu cầu phụ kiện (túi, kính, jewelry...), và server chưa có giới tính, trả {"ask":"Bạn là nam hay nữ để mình chọn phụ kiện phù hợp?"}.
- Nếu AI không thể chọn items hợp lệ từ products thì trả {"outfits":[]} hoặc {"ask":"..."}.

DỮ LIỆU ĐƯỢC CẤP:
- "user": thông tin user, measurements, purchased, favorites.
- "session_history": lịch sử cuộc hội thoại (role + content) — dùng để duy trì ngữ cảnh khi cần.
- "size_guides": bảng size theo category (dùng để gợi ý size, không dùng để sinh variant).
- "products": mảng item (variant_id, product_id, name, category, color, sizes, stock, price).

HƯỚNG DẪN CHUNG:
- KHÔNG hallucinate: mọi đề xuất phải dựa trên fields trong "products" hoặc thông tin user/size_guides.
- Nếu AI sử dụng tên sản phẩm thay vì variant_id, server sẽ chạy fuzzy-match; AI nên ưu tiên trả variant_id.
- Không trả markdown, không trả text ngoài JSON, không liệt kê thêm chú thích.

QUY TẮC CHẶT:
- TRẢ VỀ TỐI ĐA 1 outfit duy nhất (server sẽ chỉ trả 1).
- Nếu có thể, outfit PHẢI gồm ít nhất 1 "Top" (áo) và 1 "Bottom" (quần/chân váy). Nếu không có top trong dữ liệu thì chọn item phù hợp nhất.
- KHÔNG trả nhiều item thuộc cùng 1 category (ví dụ: quần + quần). Tránh duplicates.
- Mọi items phải là variant_id tồn tại trong "products" (server sẽ validate).
- Không in thêm giải thích, chỉ trả một JSON object theo schema.
...rest of prompt...
    `.trim();

    // Few-shot example to guide structure (keeps AI consistent)
    const exampleUser = `User: Occasion: đi hẹn hò; Weather: trời se lạnh.
Products: [{"variant_id":"v1","name":"Áo len ôm","category":"Top","color":"đỏ","sizes":"S,M,L","stock":5},{"variant_id":"v2","name":"Chân váy xòe","category":"Bottom","color":"đen","sizes":"S,M,L","stock":3}]
Task: Gợi 1 outfit.`;

    const exampleAssistant = `{"outfits":[{"name":"Hẹn hò nữ tính - Red knit + Black skirt","description":"Áo len ôm đỏ ôm vừa, phối cùng chân váy đen xòe tạo độ duyên. Thêm boots/giày cao gót và clutch để hoàn thiện. Bạn muốn mình chọn size theo số đo không?","items":["v1","v2"],"why":"Màu đỏ nổi bật kết hợp cùng đen trung hòa, phù hợp cho buổi tối hẹn hò."}]}`;

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      // include session history (already persisted earlier if opts.message)
      ...sessionHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      // few-shot
      { role: 'user', content: exampleUser },
      { role: 'assistant', content: exampleAssistant },
      // actual context
      { role: 'user', content: JSON.stringify({
          user: {
            id: user.id,
            name: user.full_name,
            height: user.height,
            weight: user.weight,
            bust: user.bust,
            waist: user.waist,
            hip: user.hip
          },
          occasion,
          weather,
          favorites: favorites.map(f => ({ id: f.id, name: f.name })),
          purchased: purchased.map(p => ({ id: p.id, name: p.name, variant_id: p.variant_id })),
          size_guides: guidesByCategory, // may be large but helpful
          products: compactProducts,
          max_outfits: opts.maxOutfits || 3
      }) }
    ];

    // call OpenAI - outside of any DB transaction (avoid keeping locks while waiting)
     let assistantText = null;
     let aiOutfits = null;
     try {
       if (openai && typeof openai.createChatCompletion === 'function') {
         const resp = await callOpenAIWithRetry(() => openai.createChatCompletion({
           model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
           messages,
           temperature: 0.25,
           top_p: 0.95,
           max_tokens: 800
         }));
         assistantText = (resp && (resp.choices?.[0]?.message?.content || resp.choices?.[0]?.text || '')) || '';
         console.debug('[aiService] OpenAI raw assistantText:', String(assistantText).slice(0, 2000));
       } else if (openai && typeof openai.chat === 'function') {
         const resp = await callOpenAIWithRetry(() => openai.chat({
           messages,
           max_tokens: 800,
           temperature: 0.25,
           top_p: 0.95
         }));
         assistantText = resp?.content || '';
         console.debug('[aiService] OpenAI raw assistantText (chat):', String(assistantText).slice(0, 2000));
       } else {
         throw new Error('openai.createChatCompletion not available');
       }

       // extract JSON block (unchanged)
       const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
       console.debug('[aiService] OpenAI jsonMatch present:', Boolean(jsonMatch));
       if (jsonMatch) {
         try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.debug('[aiService] OpenAI parsed JSON (outfits count):', Array.isArray(parsed.outfits) ? parsed.outfits.length : 0);
           if (Array.isArray(parsed.outfits)) aiOutfits = parsed.outfits;
         } catch (e) {
           console.warn('AI JSON parse failed:', e.message);
         }
       }

    } catch (err) {
      console.warn('OpenAI request failed or timed out, falling back to DB heuristic:', err && err.message ? err.message : err);
      assistantText = null;
      aiOutfits = null;
    }

    // If AI returned outfits, validate and sanitize (with fuzzy matching fallback)
    if (Array.isArray(aiOutfits) && aiOutfits.length > 0) {
      console.debug('[aiService] aiOutfits raw:', JSON.stringify(aiOutfits).slice(0,2000));
       const sanitized = [];
       for (const o of aiOutfits.slice(0, opts.maxOutfits || 3)) {
         if (!o || !Array.isArray(o.items)) continue;

        // Normalize items: try direct acceptance, else try fuzzy matching to known compactProducts
        const items = [];
        for (let raw of o.items) {
          const idStr = String(raw || '').trim();
          if (!idStr) continue;
          if (validVariants.has(idStr)) {
            items.push(idStr);
            continue;
          }
          // try fuzzy match against compactProducts (AI might provide product names)
          const mapped = fuzzyMatchVariant(compactProducts, idStr);
          if (mapped && validVariants.has(mapped)) {
            items.push(mapped);
            continue;
          }
          // try also matching by removing non-alphanumerics (some AIs add punctuation)
          const cleaned = idStr.replace(/[^a-z0-9-_.]/gi, '').toLowerCase();
          if (cleaned && validVariants.has(cleaned)) {
            items.push(cleaned);
          }
        }

        if (items.length === 0) continue;

        // ensure description length constraints (2-3 câu)
        const descRaw = String(o.description || '');
        const descSentences = descRaw.split(/(?<=\.)\s+/).filter(Boolean).slice(0,3);
        let desc = descSentences.join(' ').trim();
        if (desc && !desc.endsWith('.')) desc += '.';

        sanitized.push({
          name: String(o.name || 'Outfit').slice(0, 120),
          description: desc || (items.length ? 'Một set phối gợi ý từ Luna.' : ''),
          items,
          why: String(o.why || '').slice(0, 500)
        });
      }

      if (sanitized.length > 0) {
        // Build a quick map from variant_id -> product info available in `products`
        const namesByVariant = {};
        for (const p of products) {
          namesByVariant[String(p.variant_id)] = {
            name: p.name,
            category_id: p.category_id,
            category_name: (p.category_name || p.category || '').toString()
          };
        }

        // Use global normalizer (server-side enforcement)
        for (const out of sanitized) {
          out.items = normalizeOutfitItemsGlobal(out.items, namesByVariant, 4);
        }
        const limitedSanitized = sanitized.slice(0, opts.maxOutfits || 3); // server returns 1 outfit

        // --- ADDED: compute size suggestions and assistantTextWithSizes to avoid undefined variable ---
        // Decide whether we should compute size suggestions:
        // Only compute if user provided measurements in profile OR explicitly requested size advice.
        const wantsSizeExplicit = Boolean(opts.requestSize) || /\b(size|chọn size|tư vấn size|size phù hợp|kích cỡ)\b/i.test(String(opts.message || ''));
        // require BOTH height & weight as minimal measurements to provide size suggestions
        const userHasMeasurements = Boolean(user && user.height && user.weight);
        const wantsSizeButMissingMeasurements = wantsSizeExplicit && !userHasMeasurements;
 
         // attach per-item size suggestions ONLY when allowed
         for (const out of limitedSanitized) {
          out.size_suggestions = null;
          if (userHasMeasurements) {
             out.size_suggestions = out.items.map(vid => {
               const p = namesByVariant[String(vid)] || {};
               const guides = p.category_id ? (guidesByCategory[p.category_id] || []) : [];
               return pickSizeFromGuides(guides, {
                 height: user.height,
                 weight: user.weight,
                 bust: user.bust,
                 waist: user.waist,
                 hip: user.hip
               }) || null;
             });
           }
         }
 
         // build assistant text: include size hints only when computed; always append follow-up question
         const sizeHints = [];
         for (const out of limitedSanitized) {
           if (Array.isArray(out.size_suggestions) && out.size_suggestions.length) {
             const hints = out.items.map((vid, i) => {
               const nm = namesByVariant[String(vid)]?.name || vid;
               const s = out.size_suggestions[i];
               return s ? `${nm} → ${s}` : null;
             }).filter(Boolean);
             if (hints.length) sizeHints.push(`Gợi ý size: ${hints.join('; ')}`);
           }
         }
         const assistantTextToSave = (assistantText && assistantText.trim()) || `Mình đã gợi ý ${limitedSanitized.length} set cho bạn.`;
         // always include a short follow-up question inviting to "xem thêm"
         const followUpQuestion = 'Bạn có muốn xem thêm 1 outfit khác không?';
        // if user explicitly asked for size but missing measurements -> ask for measurements instead of fabricating sizes
        const measurementAsk = wantsSizeButMissingMeasurements ? ' Bạn cho mình biết chiều cao và cân nặng (cm/kg) để mình tư vấn size chính xác nhé?' : '';
        const assistantTextWithSizes = userHasMeasurements
          ? (sizeHints.length ? `${assistantTextToSave} ${sizeHints.join(' ')} ${followUpQuestion}` : `${assistantTextToSave} ${followUpQuestion}`)
          : (wantsSizeButMissingMeasurements ? `${assistantTextToSave} ${measurementAsk}` : `${assistantTextToSave} ${followUpQuestion}`);
        // --- END ADDED ---
 
 // Persist assistant message + recommendation inside a short transaction to keep DB consistent.
         await client.query('BEGIN');
         txStarted = true;
         if (opts.sessionId) {
           await client.query(
             `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'assistant', $2, NOW())`,
             [opts.sessionId, assistantTextWithSizes]
           );
           await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [opts.sessionId]);
         }

        // persist recommendation with richer metadata so later references ("cái áo đó") resolve to the same product name
        // Store items as array of variant_id strings for easy reuse/exclusion.
        // Keep metadata in a separate `meta` field so we don't break exclude/filter logic.
        const storedOutfits = limitedSanitized.map(o => {
          const itemsStrings = o.items.map(vid => String(vid));
          const itemsMeta = o.items.map(vid => {
            const p = namesByVariant[String(vid)] || {};
            return { variant_id: String(vid), product_name: p.name || null, category_id: p.category_id || null };
          });
          return {
            name: o.name,
            why: o.why,
            items: itemsStrings,    // primary: simple array of variant_id strings
            meta: itemsMeta         // optional metadata for later resolution
          };
        });
        await client.query(
          `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
           VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
          [userId, JSON.stringify({ occasion, weather }), JSON.stringify({ outfits: storedOutfits }), process.env.OPENAI_MODEL || 'gpt-4o-mini']
        );

        const followUp = buildFollowUpForOutfits(limitedSanitized);
        await client.query('COMMIT');
        txStarted = false;
        return { reply: assistantTextWithSizes, outfits: limitedSanitized, followUp, sessionId: opts.sessionId || null };
      }
    }

    // Fallback deterministic heuristic (unchanged but ensure commit)
    // group by category and build outfits (kept simple)
    const byCat = {};
    products.forEach(r => {
      const cat = (r.category_name || 'Khác').trim();
      byCat[cat] = byCat[cat] || [];
      byCat[cat].push(r);
    });
    const categories = Object.keys(byCat).sort();
    const outfits = [];
    for (let i = 0; i < Math.min(opts.maxOutfits || 3, 6); i++) {
      const chosen = new Set();
      const items = [];
      const mainIdx = i % categories.length;
      const secondaryIdx = (mainIdx + 1) % categories.length;
      const tertiaryIdx = (mainIdx + 2) % categories.length;
      const pickFrom = idx => {
        const arr = byCat[categories[idx]];
        for (const v of arr) {
          if (!chosen.has(v.variant_id)) {
            chosen.add(v.variant_id);
            return v;
          }
        }
        return null;
      };
      const a = pickFrom(mainIdx);
      const b = pickFrom(secondaryIdx) || pickFrom((secondaryIdx + 1) % categories.length);
      const c = pickFrom(tertiaryIdx) || pickFrom((tertiaryIdx + 2) % categories.length);
      if (a) items.push(a.variant_id);
      if (b) items.push(b.variant_id);
      if (c) items.push(c.variant_id);
      if (items.length === 0) continue;

      const namesQ = await client.query(
        `SELECT pv.id AS variant_id, p.name AS product_name, c.name AS category_name, pv.color_name, pv.sizes, pv.stock_qty
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE pv.id = ANY($1::uuid[])`,
        [items]
      );
      const namesById = {};
      namesQ.rows.forEach(r => namesById[r.variant_id] = r);

      // normalize items server-side to tránh quần+quần sets
      const normalizedItems = normalizeOutfitItemsGlobal(items, namesById, 4);

      const title = namesById[normalizedizedItems[0]] ? `${namesById[normalizedizedItems[0]].category_name || 'Outfit'}: ${namesById[normalizedizedItems[0]].product_name}` : `Outfit ${i+1}`;
      const descParts = normalizedItems.map(id => {
        const n = namesById[id];
        if (!n) return id;
        return `${n.product_name}${n.color_name ? ' ('+n.color_name+')' : ''}`;
      });

      const whyText = `Phối dựa trên màu sắc, kiểu dáng và hàng có sẵn phù hợp cho ${occasion || 'nhiều dịp'}.`;

      // compute size suggestion using normalizedItems...
      // push only first outfit overall (we'll slice outfits after loop)
      outfits.push({
        name: title,
        description: descParts.join(' + ') + `. Gợi ý phối: thử phối cùng phụ kiện nhẹ để hoàn thiện set.`,
        items: normalizedItems,
        why: whyText
      });
    }

// After loop, ensure only single outfit returned
    const finalOutfits = outfits.length ? [outfits[0]] : [];

    // Persist fallback recommendation in a short transaction
    await client.query('BEGIN');
    txStarted = true;
    await client.query(
      `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
      [userId, JSON.stringify({ occasion, weather }), JSON.stringify({ outfits: finalOutfits }), 'db-heuristic-fallback']
    );
    await client.query('COMMIT');
    txStarted = false;
    return { reply: finalOutfits.map((o,idx) => `Gợi ý ${idx+1}: ${o.name} — ${o.description}`).join('\n\n'), outfits: finalOutfits, sessionId: opts.sessionId || null };
 
   } catch (err) {
    // rollback only if we started a transaction
    try { if (typeof txStarted !== 'undefined' && txStarted) await client.query('ROLLBACK'); } catch(e){ /* ignore */ }
    throw err;
   } finally {
     client.release();
   }
 };
 
// --- OPENAI: improved retry + timeout wrapper (supports Retry-After header) ---
const OPENAI_TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT_MS || '10000'); // default 10s
const OPENAI_MAX_RETRIES = parseInt(process.env.OPENAI_MAX_RETRIES || '3');
const OPENAI_BASE_DELAY_MS = parseInt(process.env.OPENAI_BASE_DELAY_MS || '800');

const callOpenAIWithRetry = async (fn, opts = {}) => {
  const maxRetries = typeof opts.maxRetries === 'number' ? opts.maxRetries : OPENAI_MAX_RETRIES;
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : OPENAI_TIMEOUT_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // race between real call and timeout
      const resp = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('OpenAI timeout')), timeoutMs))
      ]);
      return resp;
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      const status = err && (err.status || (err.response && err.response.status));
      const retryAfterHeader = err && err.response && err.response.headers && err.response.headers['retry-after'];

      const isRateLimit = status === 429 || /rate limit|rate_limit|too many requests/i.test(msg);
      const isTransient = /timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|OpenAI timeout/i.test(msg);

      // if Retry-After present from server, respect it (in seconds)
      let retryDelay = OPENAI_BASE_DELAY_MS * Math.pow(2, attempt);
      if (retryAfterHeader) {
        const ra = Number(retryAfterHeader);
        if (!Number.isNaN(ra)) retryDelay = Math.max(retryDelay, ra * 1000);
      }

      // if last attempt or non-transient non-rate-limit => throw
      if (attempt === maxRetries || (!isRateLimit && !isTransient)) {
        // attach status for caller
        err._openai_status = status || null;
        throw err;
      }

      console.warn(`[openai retry] attempt=${attempt+1} status=${status || 'n/a'} msg=${msg}. retrying after ${retryDelay}ms`);
      await sleep(retryDelay);
      // continue retry loop
    }
  }

  throw new Error('OpenAI call failed after retries');
};
// --- END: additions ---

// helper: load last N messages from ai_chat_messages for a session (chronological order)
const loadSessionHistory = async (client, sessionId, limit = 60) => {
  if (!sessionId) return [];
  const q = await client.query(
    `SELECT role, content, created_at
     FROM ai_chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );
  // reverse to chronological order and sanitize content length
  return q.rows.reverse().map(r => ({
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: (typeof r.content === 'string' ? r.content : JSON.stringify(r.content)).slice(0, 4000) // trim very long messages
  }));
};

// helper: attempt to fuzzy-match an AI token (could be variant_id, product name, or color) to a known variant in compactProducts
const fuzzyMatchVariant = (compactProducts, token) => {
  if (!token || !compactProducts || compactProducts.length === 0) return null;
  const t = String(token).toLowerCase().trim();

  // 1) direct match by variant_id
  for (const p of compactProducts) {
    if (String(p.variant_id).toLowerCase() === t) return String(p.variant_id);
  }

  // 2) exact full name or color match (prefer exact)
  for (const p of compactProducts) {
    if (p.name && p.name.toLowerCase() === t) return String(p.variant_id);
    if (p.color && p.color.toLowerCase() === t) return String(p.variant_id);
  }

  // 3) word-boundary / startsWith match has higher weight; require threshold to accept
  let best = null;
  let bestScore = 0;
  const tokens = t.split(/\s+/).filter(Boolean);
  for (const p of compactProducts) {
    const name = (p.name || '').toLowerCase();
    const color = (p.color || '').toLowerCase();
    let score = 0;

    if (!name && !color) continue;

    // strong signals
    if (name && name === t) score += 40;
    if (name && name.startsWith(t)) score += 20;
    if (name && new RegExp(`\\b${escapeRegExp(t)}\\b`).test(name)) score += 18;

    // color strong signal
    if (color && color === t) score += 16;
    if (color && new RegExp(`\\b${escapeRegExp(t)}\\b`).test(color)) score += 12;

    // partial token matches
    for (const tk of tokens) {
      if (name.includes(tk)) score += 3;
      if (color.includes(tk)) score += 3;
    }

    // small bonus for longer common substrings
    if (name && t.length > 3 && name.includes(t)) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  // accept only if confident
  // increase minimum confidence to reduce wrong mappings
  if (best && bestScore >= 18) {
    console.debug('[aiService.fuzzyMatchVariant] mapped token ->', token, '=>', String(best.variant_id), 'score=', bestScore);
    return String(best.variant_id);
  }
  return null;
};

// small helper for regex-safe token matching
function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// helper: lightweight rule-based slot extractor (Vietnamese keywords)
const extractSlotsFromMessage = (message) => {
  if (!message || typeof message !== 'string') return {};

  const m = message.toLowerCase();

  // occasion keywords
  const occasionMap = [
    { k: ['hẹn hò','hen ho','hẹn họ'], v: 'hẹn hò' },
    { k: ['đi chơi','di choi','dạo phố'], v: 'đi chơi' },
    { k: ['dự tiệc','đi dự tiệc','tiệc'], v: 'dự tiệc' },
    { k: ['đi làm','công sở','office'], v: 'đi làm' },
    { k: ['đi học','học'], v: 'đi học' },
    { k: ['tập gym','gym','thể thao'], v: 'tập gym' }
  ];
  let occasion = null;
  for (const oc of occasionMap) {
    if (oc.k.some(kw => m.includes(kw))) { occasion = oc.v; break; }
  }

  // weather keywords / temperature pattern
  let weather = null;
  const tempMatch = m.match(/(\d{1,2})\s?°?c/);
  if (tempMatch) weather = `${tempMatch[1]}°C`;
  else if (m.includes('nóng') || m.includes('nuáng') || m.includes('nắng')) weather = 'nóng, nắng';
  else if (m.includes('lạnh') || m.includes('se lạnh') || m.includes('se lạnh'.normalize('NFC'))) weather = 'lạnh';
  else if (m.includes('mát') || m.includes('mát mẻ') || m.includes('mát mẻ')) weather = 'mát';
  else if (m.includes('mưa')) weather = 'mưa';

  // style keywords
  const styles = [
    'đơn giản','không cầu kì','minimal','minimalist','thoải mái','casual','sang trọng','quiet luxury','trendy','năng động','street'
  ];
  const foundStyles = styles.filter(s => m.includes(s)).map(s => s);

  // accessories intent
  const accessoriesKey = ['phụ kiện','túi','ví','kính','mắt kính','jewelry','vòng','dây chuyền','thắt lưng','belt'];
  const wantsAccessories = accessoriesKey.some(k => m.includes(k));

  // gender hint
  let gender = null;
  if (m.includes('nam')) gender = 'nam';
  else if (m.includes('nữ') || m.includes('nu')) gender = 'nữ';

  // product mention heuristic (sku/id unlikely here) — extract noun phrases roughly
  // keep simple: look for word "sản phẩm" or "áo"/"quần"/"váy" context
  const productHints = [];
  const productKeywords = ['áo','quần','váy','đầm','áo len','hoodie','jean','jacket','blazer','vest'];
  for (const pk of productKeywords) if (m.includes(pk)) productHints.push(pk);

  return {
    occasion,
    weather,
    style: foundStyles.length ? foundStyles.join(', ') : null,
    wantsAccessories,
    gender,
    productHints: productHints.length ? productHints : null
  };
};

// helper: fallback parser via OpenAI to produce strict slots JSON (only used if rule-based incomplete)
const parseWithOpenAI = async (message) => {
  if (!openai || typeof openai.createChatCompletion !== 'function') return null;
  const sys = `You are a JSON slot parser. Receive a user's Vietnamese sentence and return JSON only with keys: { "occasion", "weather", "style", "gender", "wantsAccessories" }.
- If a slot is missing, return null for it.
- weather can be descriptive (e.g., "mát", "lạnh", "25°C")`;
  const user = `Sentence: ${message}\nReturn JSON only.`;

  try {
    const resp = await callOpenAIWithRetry(() => openai.createChatCompletion({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      temperature: 0.0,
      max_tokens: 200
    }), { timeoutMs: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });

    const txt = resp?.choices?.[0]?.message?.content || resp?.choices?.[0]?.text || '';
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      occasion: parsed.occasion || null,
      weather: parsed.weather || null,
      style: parsed.style || null,
      gender: parsed.gender || null,
      wantsAccessories: parsed.wantsAccessories || false
    };
  } catch (e) {
    // if rate-limited: log and return null (so fallback heuristic kicks in)
    const isRateLimit = e && (e._openai_status === 429 || /rate limit/i.test(String(e.message)));
    console.warn('parseWithOpenAI failed:', (e && e.message) || e);
    if (isRateLimit) {
      console.warn('parseWithOpenAI: rate limit detected, skipping LLM parse and falling back to rule-based slots');
      return null;
    }
    return null;
  }
};


// helper: build followUp options after generating outfits
const buildFollowUpForOutfits = (outfits) => {
  const options = ['Xem thêm'];
  outfits.forEach((_, i) => options.push(`Chọn ${i+1}`));
  return {
    text: 'Bạn có muốn xem thêm 1 outfit khác không? Hoặc bạn có muốn mình tư vấn size cho bộ nào không? (ví dụ: "Xem thêm" hoặc "Chọn 2")',
    options
  };
};

// new: handle user selecting an outfit from previous recommendation
exports.handleOutfitSelection = async (userId, sessionId, index) => {
  const client = await pool.connect();
  try {
    // get last recommendation for this session OR user
    const recQ = await client.query(
      `SELECT id, items, created_at FROM ai_recommendations WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (recQ.rowCount === 0) {
      return { ask: 'Mình chưa tìm được set nào trước đó. Bạn muốn mình tìm vài set để chọn không?' , sessionId };
    }
    const rec = recQ.rows[0];
    const recJson = rec.items && typeof rec.items === 'object' ? rec.items : JSON.parse(rec.items || '{}');
    const outfits = recJson.outfits || [];
    const idx = index - 1;
    if (idx < 0 || idx >= outfits.length) {
      return { ask: `Mình không tìm thấy outfit thứ ${index}. Bạn thử chọn lại nhé.`, sessionId };
    }
    const selected = outfits[idx];

    // fetch variant details for items
    const variantIds = selected.items || [];
    const vQ = await client.query(
      `SELECT pv.id, pv.sku, pv.color_name, pv.sizes, p.name as product_name
       FROM product_variants pv JOIN products p ON pv.product_id = p.id
       WHERE pv.id = ANY($1::uuid[])`,
      [variantIds]
    );

    const variants = vQ.rows;
    // build reply (no "nhé", polite direct phrasing)
    const reply = `Đã chọn: ${selected.name}. Mình sẽ giúp bạn tư vấn size cho các món sau: ${variants.map(v => v.product_name + (v.color_name ? ' ('+v.color_name+')' : '')).join(', ')}. Bạn muốn mình tư vấn size theo số đo của bạn hay theo kích cỡ thường (S/M/L)?`;

    // persist assistant message
    if (sessionId) {
      await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'assistant', $2, NOW())`, [sessionId, reply]);
      await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
    }

    return { reply, selected, sessionId };
  } catch (err) {
    console.error('handleOutfitSelection err', err && err.stack ? err.stack : err);
    return { ask: 'Có lỗi khi xử lý lựa chọn của bạn. Thử lại nha.', sessionId };
  } finally {
    client.release();
  }
};

// Robust handleGeneralMessage: always returns an object and logs helpful info
exports.handleGeneralMessage = async (userId, opts = {}) => {
  const client = await pool.connect();
  try {
    const { message = '', sessionId = null, lastRecommendationAllowed = true } = opts || {};
    console.log('[aiService.handleGeneralMessage] start (no early persist)', { userId, sessionId, message: String(message).slice(0,120) });

    // load last recommendation for contextual resolution (if any)
    let lastRec = null;
    if (lastRecommendationAllowed) {
      try {
        // include context so downstream "show more" can reuse occasion/weather without extra fetch
        const recQ = await client.query(
          `SELECT id, items, context, created_at FROM ai_recommendations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        if (recQ.rowCount > 0) lastRec = recQ.rows[0];
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] load last recommendation failed', e && e.stack ? e.stack : e);
      }
    }

    // helper: resolve simple references ("áo đó", "outfit 2") -> variant id or null
    const resolveRefFromLastRecommendation = (lastRecLocal, msg) => {
      if (!lastRecLocal || !msg) return null;
      let recJson = lastRecLocal.items;
      if (typeof recJson === 'string') {
        try { recJson = JSON.parse(recJson); } catch (e) { recJson = null; }
      }
      const outfits = (recJson && recJson.outfits) ? recJson.outfits : [];
      const idxMatch = String(msg).match(/(?:thứ\s*)?(\d+)|(?:bộ|outfit|chọn)\s*(\d+)/i);
      if (idxMatch) {
        const n = Number(idxMatch[1] || idxMatch[2]);
        if (!Number.isNaN(n) && outfits[n - 1]) return outfits[n - 1].items && outfits[n - 1].items[0];
      }
      const token = String(msg || '').toLowerCase();
      for (const o of outfits) {
        const name = (o.name || '').toLowerCase();
        const desc = (o.description || '').toLowerCase();
        if (token.includes('áo') && (name.includes('áo') || desc.includes('áo'))) return o.items && o.items[0];
        if (token.includes('quần') && (name.includes('quần') || desc.includes('quần'))) return o.items && o.items[0];
      }
      if (outfits.length === 1 && outfits[0].items && outfits[0].items[0]) return outfits[0].items[0];
      return null;
    };

    const lowerMsg = String(message || '').toLowerCase();
    const stockIntentRe = /\b(có\s+size|còn\s+size|còn\s+hàng|còn\s+không|còn\s+size\s*[a-z0-9]|có\s+hàng)\b/i;
    const recommendIntentRe = /\b(tư vấn|gợi ý|chọn\s*size|giúp\s*mình|muốn|gợi ý\s*1|muốn\s*(?:1|một)?\s*(?:bộ|outfit|set)|bộ|outfit|set|mix\s*đồ|phối\s*đồ|basic|đơn giản|văn\s+phòng|công\s+sở)\b/i;
    const quickSuggestKeywords = /\b(basic|đơn giản|văn phòng|công sở|office|phối đồ|mix đồ)\b/i;
    const slotHints = (typeof extractSlotsFromMessage === 'function') ? extractSlotsFromMessage(message || '') : {};

    // follow-up intents
    const showMoreIntent = /\b(xem thêm|thêm (?:1|một)? (?:outfit|bộ|set)|thêm giúp|thêm nữa)\b/i;
    const colorIntent = /\b(màu|màu gì|màu nào)\b/i;
    const sizeIntent = /\b(size|cỡ|kích cỡ|chiều cao|cân nặng|tư vấn size)\b/i;

    // 1) show more -> call generateOutfitRecommendation excluding previous variants
    if (showMoreIntent.test(lowerMsg)) {
      // try to reuse last recommendation's context so LLM won't ask for occasion/weather again
      let last = lastRec;
      if (!last && lastRecommendationAllowed) {
        try {
          const lq = await client.query(`SELECT id, items, context FROM ai_recommendations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId]);
          if (lq.rowCount) last = lq.rows[0];
        } catch (e) { /* ignore */ }
      }
      const excludeIds = [];
      if (last) {
        // extract variant ids robustly
        let recJson = last.items;
        if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch (e) { recJson = null; } }
        const outfits = recJson && recJson.outfits ? recJson.outfits : [];
        for (const o of outfits) {
          if (!Array.isArray(o.items)) continue;
          for (const it of o.items) {
            if (typeof it === 'string' && it.trim()) excludeIds.push(String(it));
            else if (it && typeof it === 'object') {
              if (it.variant_id) excludeIds.push(String(it.variant_id));
              else if (it.id) excludeIds.push(String(it.id));
            }
          }
        }
      }

      // prefer to reuse stored context (occasion/weather) if available
      let occasionFromContext = null;
      let weatherFromContext = null;
      if (last && last.context) {
        try {
          const ctx = typeof last.context === 'string' ? JSON.parse(last.context) : last.context;
          occasionFromContext = ctx && ctx.occasion ? ctx.occasion : null;
          weatherFromContext = ctx && ctx.weather ? ctx.weather : null;
        } catch (e) { /* ignore parse errors */ }
      }

      try {
        console.debug('[aiService.handleGeneralMessage.showMore] reusing context', { occasionFromContext, weatherFromContext, excludeCount: excludeIds.length });
        // Do NOT forward the raw "show more" user message to generator — it may trigger parsing & asking again.
        const rec = await exports.generateOutfitRecommendation(
          userId,
          occasionFromContext, // reuse occasion from last rec when possible
          weatherFromContext,  // reuse weather from last rec when possible
          { sessionId, /* message intentionally omitted */ maxOutfits: 1, excludeVariantIds: excludeIds, more: true }
        );
        if (rec && rec.outfits && rec.outfits.length) return { reply: rec.reply || rec.message || 'Mình gợi ý thêm 1 set cho bạn.', outfits: rec.outfits, sessionId };
        return { reply: 'Mình chưa tìm được set khác, bạn muốn thử phong cách khác không?', outfits: [], sessionId };
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] showMore flow failed', e && e.stack ? e.stack : e);
        return { reply: 'Mình không tìm được set mới ngay bây giờ, thử lại sau nhé!', outfits: [], sessionId };
      }
    }

    // 2) stock/color/size follow-ups referencing last recommendation
    if (stockIntentRe.test(lowerMsg) || colorIntent.test(lowerMsg) || sizeIntent.test(lowerMsg)) {
      const refVariant = resolveRefFromLastRecommendation(lastRec, message);
      if (!refVariant) {
        return { ask: 'Bạn đang nói tới món đồ nào trong gợi ý trước đó? Bạn có thể nói "cái áo đó" hoặc "outfit 2" nhé.', sessionId };
      }

      if (stockIntentRe.test(lowerMsg)) {
        try {
          const info = await checkVariantAvailability(refVariant);
          if (!info) return { reply: 'Mình không tìm thấy sản phẩm này trong kho.', sessionId };
          const reply = info.stock_qty > 0 ? `Chiếc đó vẫn còn ${info.stock_qty} chiếc trong kho.` : 'Chiếc đó hiện đã hết hàng rồi.';
          return { reply, sessionId };
        } catch (e) {
          return { reply: 'Mình không truy xuất được kho lúc này, thử lại sau nhé.', sessionId };
        }
      }

      if (colorIntent.test(lowerMsg)) {
        try {
          const variants = await getVariantColorsByVariant(refVariant);
          if (!variants || variants.length === 0) return { reply: 'Mình không tìm thấy màu cho sản phẩm này.', sessionId };
          const colors = variants.map(v => (v.color_name || 'Không rõ') + (v.stock_qty > 0 ? ' (còn hàng)' : ' (hết)'));
          return { reply: `Sản phẩm có các màu: ${colors.join(', ')}.`, sessionId };
        } catch (e) {
          return { reply: 'Mình không lấy được thông tin màu lúc này, thử lại sau nhé.', sessionId };
        }
      }

      if (sizeIntent.test(lowerMsg)) {
        try {
          const uQ = await client.query(`SELECT height, weight, bust, waist, hip FROM users WHERE id = $1 LIMIT 1`, [userId]);
          const u = uQ.rows[0];
          if (!u || (!u.height && !u.weight && !u.bust && !u.waist && !u.hip)) {
            return { ask: 'Bạn cho mình biết chiều cao và cân nặng (cm/kg) để mình tư vấn size chính xác nhé?', sessionId };
          }
          const pvQ = await client.query(`SELECT product_id FROM product_variants WHERE id = $1 LIMIT 1`, [refVariant]);
          const productId = pvQ.rowCount ? pvQ.rows[0].product_id : null;
          let guides = [];
          if (productId) {
            const prodQ = await client.query(`SELECT category_id FROM products WHERE id = $1 LIMIT 1`, [productId]);
            const categoryId = prodQ.rowCount ? prodQ.rows[0].category_id : null;
            if (categoryId) {
              const sgQ = await client.query(`SELECT size_label, min_height, max_height, min_weight, max_weight FROM size_guides WHERE category_id = $1`, [categoryId]);
              guides = sgQ.rows || [];
            }
          }
          const suggested = pickSizeFromGuides(guides, u) || 'Không chắc — mình cần biết số đo vòng ngực/eo/hông để tư vấn kỹ hơn.';
          return { reply: `Mình gợi ý size: ${suggested}. Bạn muốn mình lưu size này hay so sánh với S/M/L không?`, sessionId };
        } catch (e) {
          return { reply: 'Mình không truy xuất được thông tin size lúc này, thử lại sau nhé.', sessionId };
        }
      }
    }

    // If user asked for new recommendation (original flow)
    if (recommendIntentRe.test(lowerMsg) || quickSuggestKeywords.test(lowerMsg) || slotHints.occasion || slotHints.style || (slotHints.productHints && slotHints.productHints.length)) {
      try {
        const rec = await exports.generateOutfitRecommendation(userId, null, null, {
          sessionId,
          message,
          maxOutfits: opts?.maxOutfits || 3
        });

        if (!rec) {
          console.error('[aiService.handleGeneralMessage] generateOutfitRecommendation returned empty');
          return { reply: 'Mình đang tạm thời không thể gợi ý được. Thử lại sau nhé!', outfits: [], sessionId };
        }

        if (rec.ask) {
          const askText = rec.ask;
          if (sessionId) {
            try {
              await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, askText]);
              await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
            } catch (e) {
              console.error('[aiService.handleGeneralMessage] persist ask failed', e && e.stack ? e.stack : e);
            }
          }
          return { ask: askText, outfits: Array.isArray(rec.outfits) ? rec.outfits : [], sessionId };
        }

        const outfitsArr = Array.isArray(rec.outfits) ? rec.outfits : [];
        const replyText = rec.reply || rec.message || (outfitsArr.length ? `Mình đã gợi ý ${outfitsArr.length} set cho bạn.` : 'Mình chưa tìm được set phù hợp, bạn muốn mình thử phong cách khác không?');

        if (sessionId && replyText) {
          try {
            await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, replyText]);
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
          } catch (e) {
            console.error('[aiService.handleGeneralMessage] persist reply failed', e && e.stack ? e.stack : e);
          }
        }

        return { reply: replyText, outfits: outfitsArr, sessionId };
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] delegate to generateOutfitRecommendation failed', e && e.stack ? e.stack : e);
      }
    }

    // If nothing matched, fallback reply
    return { reply: 'Mình chưa hiểu ý bạn lắm. Bạn muốn mình gợi ý outfit hay hỏi về sản phẩm trong gợi ý trước đó?', outfits: [], sessionId };
  } catch (err) {
    console.error('[aiService.handleGeneralMessage] uncaught error', err && err.stack ? err.stack : err);
    return { reply: 'Mình đang bận thử đồ, thử lại sau nhé!', outfits: [], sessionId: opts?.sessionId || null };
  } finally {
    try { client.release(); } catch (e) { /* ignore */ }
  }
};

// --- NEW helper: normalize items to prefer Top+Bottom, avoid same-category duplicates ---
const normalizeOutfitItemsGlobal = (items = [], namesByVariant = {}, maxItems = 4) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  // map vid -> lowercased category name
  const catByVid = {};
  for (const vid of items) {
    const info = namesByVariant[String(vid)] || {};
    catByVid[vid] = (info.category_name || info.category || '').toString().toLowerCase();
  }

  const isTopCat = (c) => /áo|top|shirt|tee|blouse|sleeve|t-shirt|jaket|jacket/i.test(c);
  const isBottomCat = (c) => /quần|pants|jean|short|skirt|legging|bottom|trousers/i.test(c);

  // pick one top + one bottom if present
  let topVid = null, bottomVid = null;
  for (const vid of items) {
    const c = catByVid[vid] || '';
    if (!topVid && isTopCat(c)) topVid = vid;
    if (!bottomVid && isBottomCat(c)) bottomVid = vid;
    if (topVid && bottomVid) break;
  }

  const seenCats = new Set();
  const out = [];
  if (topVid) { seenCats.add(catByVid[topVid]); out.push(topVid); }
  if (bottomVid && bottomVid !== topVid) { seenCats.add(catByVid[bottomVid]); out.push(bottomVid); }

  // fill remaining with unique categories preserving original order
  for (const vid of items) {
    if (out.length >= maxItems) break;
    const c = catByVid[vid] || '';
    if (!c) {
      if (!out.includes(vid)) out.push(vid);
      continue;
    }
    if (seenCats.has(c)) continue;
    out.push(vid);
    seenCats.add(c);
  }

  // if result is still only bottoms (no top) but a top exists in original product pool, prefer a top if available
  if (out.length > 0) {
    const hasTop = out.some(v => isTopCat(catByVid[v]));
    if (!hasTop) {
      for (const vid of items) {
        if (isTopCat(catByVid[vid]) && !out.includes(vid)) {
          out.unshift(vid);
          // dedupe categories keeping maxItems
          while (out.length > maxItems) out.pop();
          break;
        }
      }
    }
  }

  return out.length ? out : [items[0]];
};

// --- ADDED HELPERS: resolve stored recommendation + variant helpers ---
exports.getLastRecommendationForUser = async (userId) => {
  if (!userId) return null;
  const client = await pool.connect();
  try {
    // include context so callers can reuse occasion/weather without extra queries
    const q = await client.query(
      `SELECT id, items, context, created_at FROM ai_recommendations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return q.rowCount ? q.rows[0] : null;
  } finally {
    client.release();
  }
};

const checkVariantAvailability = async (variantId) => {
  if (!variantId) return null;
  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT pv.id, pv.stock_qty, pv.sizes, pv.sku, pv.product_id FROM product_variants pv WHERE pv.id = $1 LIMIT 1`,
      [variantId]
    );
    return q.rowCount ? q.rows[0] : null;
  } finally {
    client.release();
  }
};

const getVariantColorsByVariant = async (variantId) => {
  if (!variantId) return [];
  const client = await pool.connect();
  try {
    const pQ = await client.query(`SELECT product_id FROM product_variants WHERE id = $1 LIMIT 1`, [variantId]);
    if (pQ.rowCount === 0) return [];
    const productId = pQ.rows[0].product_id;
    const q = await client.query(`SELECT id AS variant_id, color_name, sizes, stock_qty FROM product_variants WHERE product_id = $1 ORDER BY id`, [productId]);
    return q.rows;
  } finally {
    client.release();
  }
};
