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

exports.getChatSessionById = async (user_id) => {
    const client = await pool.connect();
    try {
        const sql = await client.query(
          `SELECT id FROM ai_chat_sessions WHERE user_id = $1 LIMIT 1 RETURNING id`
        );
        const params = [user_id];
        const res = await client.query(sql, params);
        if (res.rowCount === 0) return null;
        return res.rows[0];
    } finally {
        client.release();
    }
};

//start or resume chat session when user opens chatbox
exports.startChatSession = async (userId, providedSessionId = null, opts = {}) => {
  const client = await pool.connect();
  const loadMessages = Boolean(opts.loadMessages);
  const messagesLimit = Number((opts && (opts.messageLimit ?? opts.messagesLimit)) || 0) || 20;
  
  try {
    await client.query('BEGIN');

    // 1) If caller provided a session_id, try to resume it (validate ownership)
    if (providedSessionId) {
      const sRes = await client.query(
        `SELECT id FROM ai_chat_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [providedSessionId, userId]
      );
      if (sRes.rowCount > 0) {
        // Only load a limited page of messages when requested (lazy load)
        let messages = [];
        let hasMore = false;
        let nextCursor = null;
        if (loadMessages) {
          const mQ = await client.query(
            `SELECT role, content, metadata, created_at
             FROM ai_chat_messages
             WHERE session_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [providedSessionId, messagesLimit + 1] // fetch one extra to compute hasMore
          );
          const rows = mQ.rows || [];
          const hasMore = rows.length > messagesLimit;
          const sliced = rows.slice(0, messagesLimit).reverse(); // chronological order
          messages = sliced;
          nextCursor = sliced.length ? (sliced[0].created_at ? new Date(sliced[0].created_at).toISOString() : null) : null;
          await client.query('COMMIT');
          return { sessionId: providedSessionId, messages, hasMore, nextCursor, isNew: false, sessionExpired: false };
        }
        await client.query('COMMIT');
        return { sessionId: providedSessionId, messages: [], hasMore: false, nextCursor: null, isNew: false, sessionExpired: false };
      }
    }

    // 2) Persistent-per-user strategy:
    // If user already has an existing session, reuse it so FE can keep a single permanent ssid.
      const existingRes = await client.query(
      `SELECT id FROM ai_chat_sessions WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 1`,
      [userId]
    );
    if (existingRes.rowCount > 0) {
      const sessionId = existingRes.rows[0].id;
      if (loadMessages) {
        const mQ = await client.query(
          `SELECT role, content, metadata, created_at
           FROM ai_chat_messages
           WHERE session_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [sessionId, messagesLimit + 1]
        );
        const rows = mQ.rows || [];
        const hasMore = rows.length > messagesLimit;
        const messages = rows.slice(0, messagesLimit).reverse();
        const nextCursor = messages.length ? (messages[0].created_at ? new Date(messages[0].created_at).toISOString() : null) : null;
        await client.query('COMMIT');
        return { sessionId, messages, hasMore, nextCursor, isNew: false, sessionExpired: false };
      }
      await client.query('COMMIT');
      return { sessionId, messages: [], hasMore: false, nextCursor: null, isNew: false, sessionExpired: false };
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
    // return welcome message inline only when loadMessages true (otherwise FE will fetch lazily)
    if (loadMessages) {
      const createdAt = new Date().toISOString();
      return { sessionId, messages: [{ role: 'assistant', content: welcome, created_at: new Date() }], hasMore: false, nextCursor: createdAt, isNew: true, sessionExpired: false };
    }
    return { sessionId, messages: [], hasMore: false, nextCursor: null, isNew: true, sessionExpired: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

//helper: load paged messages for a session (cursor)
exports.loadSessionMessages = async (sessionId, opts = {}) => {
  const client = await pool.connect();
  try {
    const limit = Math.min(100, Number(opts.limit) || 20);
    // before cursor: if provided use created_at < before, otherwise start from latest
    const before = opts.before ? new Date(opts.before) : null;
    const params = [sessionId, limit + 1];
    let sql;
    if (before) {
      params.splice(1, 0, before); // [sessionId, before, limit+1]
      sql = `
        SELECT role, content, metadata, created_at
        FROM ai_chat_messages
        WHERE session_id = $1 AND created_at < $2
        ORDER BY created_at DESC
        LIMIT $3
      `;
    } else {
      sql = `
        SELECT role, content, metadata, created_at
        FROM ai_chat_messages
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
    }
    const q = await client.query(sql, params);
    const rows = q.rows || [];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // chronological order
    const oldest = page.length ? page[0].created_at.toISOString() : null; // cursor for next page (fetch messages before this)
    return { messages: page, hasMore, nextCursor: oldest };
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
         const accessoryKeywordsRe = /\b(phụ kiện|túi|ví|kính|kính mát|wallet|bag|tui|sunglass|clutch|purse)\b/i;
        const explicitMention = accessoryKeywordsRe.test(String(opts.message || '')) || (ruleSlots && ruleSlots.wantsAccessories) || Boolean(opts.inferredWantsAccessories);
        if (aiParsed.wantsAccessories && explicitMention) {
          opts.inferredWantsAccessories = true;
        } else {
          // keep any previous true value, otherwise stay false
          opts.inferredWantsAccessories = Boolean(opts.inferredWantsAccessories);
        }
        if (process.env.DEBUG_AI_SERVICE) console.debug('[aiService.generateOutfitRecommendation.DEBUG] aiParsed:', aiParsed, 'explicitAccessoryMention:', explicitMention, 'final.inferredWantsAccessories:', opts.inferredWantsAccessories);
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
  if ((opts.inferredWantsAccessories || /phụ kiện|túi|ví|kính/i.test(String(opts.message||''))) && !opts.inferredGender && !opts.gender) {
    return { ask: 'Bạn là nam hay nữ để mình chọn phụ kiện phù hợp?' };
  }

  const client = await pool.connect();
  try {
    // Do reads and remote LLM calls WITHOUT holding a DB transaction to avoid locking while waiting.
    let txStarted = false; // set to true only when we deliberately begin a transaction before persisting results

    // persist user message (single-statement autocommit) so session history is up-to-date for AI context.
    // Do NOT start a multi-statement DB transaction here to avoid holding locks while waiting for LLM.
    if (opts.sessionId && opts.message && !opts._userMessagePersisted) {
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

    //--XỬ LÝ: chuẩn bị dữ liệu và gọi OpenAI để tạo gợi ý outfit --//
    // fetch user + measurements (sequential because needed)
    const userQ = await client.query(`SELECT id, full_name, phone, height, weight, bust, waist, hip, gender FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const user = userQ.rows[0];
    if (!user) throw new Error("User not found");
    // resolve gender after we have user profile (opts may include inferredGender)
    const finalGender = opts.gender || opts.inferredGender || user.gender || null;
    opts._resolvedGender = finalGender;
    // detect accessories intent (from parsed rule or raw message)
    const wantsAccessories = Boolean(opts.inferredWantsAccessories) || /\b(phụ kiện|túi|ví|kính)\b/i.test(String(opts.message || ''));
    if (wantsAccessories && !finalGender) {
      // ask for gender before generating outfit with accessories
      return { ask: 'Bạn cần phụ kiện nam hay nữ để mình chọn phù hợp nhé?' };
    }

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

    // load session history để giữ ngữ cảnh (nếu có)
    //const sessionHistory = await loadSessionHistory(client, opts.sessionId, 60);
    let sessionHistory = [];
    try {
      sessionHistory = await loadSessionHistory(client, opts.sessionId, 60);
    } catch (e) {
      console.error('[aiService.generateOutfitRecommendation] load session history failed', e && e.stack ? e.stack : e);
      sessionHistory = [];
    }
    // Build compactProducts as before (after filteredProducts computed)
    const maxProductsForAI = 120; //chỉ dùng 120 sản phẩm để tránh quá tải
    const excludedSet = new Set((opts.excludeVariantIds || []).map(v => String(v))); //tạo set loại trừ các variant_id mà user đã xem
    console.debug('[aiService] excludeVariantIds count:', excludedSet.size);
    console.debug('[aiService] total products fetched:', products.length);
    let filteredProducts = products.filter(p => !excludedSet.has(String(p.variant_id)));
    console.debug('[aiService] products after exclude filter:', filteredProducts.length);

    //duy trì các variant_id trong opts.keepVariantIds ở đầu danh sách (nếu có)
    const keepSet = new Set((opts.keepVariantIds || []).map(v => String(v)));

    //danh sách cuối cùng sau khi xử lý giữ nguyên thứ tự cho các mục trong keepSet
    if (keepSet.size > 0) {
      // bring keep items to the front (if they exist in products)
      const keepItems = [];
      const prodByVid = new Map(products.map(p => [String(p.variant_id), p]));

      //lấy ra những sản phẩm nằm trong keepSet
      for (const vid of keepSet) {
        if (prodByVid.has(vid)) {
          keepItems.push(prodByVid.get(vid));
        }
      }
      // remove any keepItems from filteredProducts to avoid duplicates, then unshift
      filteredProducts = filteredProducts.filter(p => !keepSet.has(String(p.variant_id)));
      if (keepItems.length) filteredProducts.unshift(...keepItems);
    }

    // xáo trộn ngẫu nhiên phần còn lại (ngoại trừ các mục trong keepSet đã được đưa lên đầu)
    if (filteredProducts.length > 1) {
      const startIdx = keepSet.size > 0 ? Math.min(keepSet.size, filteredProducts.length) : 0;
      for (let i = filteredProducts.length - 1; i > startIdx; i--) {
        const j = Math.floor(Math.random() * (i - startIdx + 1)) + startIdx;
        const tmp = filteredProducts[i]; filteredProducts[i] = filteredProducts[j]; filteredProducts[j] = tmp;
      }
    }

    const compactProducts = filteredProducts.slice(0, maxProductsForAI).map(p => ({
       variant_id: String(p.variant_id),
       product_id: String(p.product_id),
       name: p.name,
       category: p.category_name,
       category_id: p.category_id || null,
       color: p.color_name,
       sizes: p.sizes,
       stock: p.stock_qty,
       price: p.price
     }));

    //tạo tập hợp variant_id hợp lệ để xác thực sau khi nhận kết quả từ AI
    const validVariants = new Set(compactProducts.map(p => String(p.variant_id)));

    const makeOneTopOneBottom = (items = [], namesByVariantLocal = {}, accessoryCategoryIdSetLocal = new Set()) => {
      if (!Array.isArray(items) || items.length === 0) return null;
      const topReLocal = /\b(áo|top|shirt|tee|blouse|sơ mi|áo len|hoodie|polo|t-shirt|jacket|coat|đầm|dress)\b/i;
      const bottomReLocal = /\b(quần|pants|jean|short|skirt|váy|legging|trousers|kaki|chino)\b/i;

      const getText = (vid) => {
        const info = namesByVariantLocal[String(vid)] || {};
        if (info && (info.category_name || info.name)) return (((info.category_name || '') + ' ' + (info.name || '')).toString()).toLowerCase();
        // fallback to compactProducts snapshot
        const p = compactProducts.find(pp => String(pp.variant_id) === String(vid));
        if (p) return (((p.category || '') + ' ' + (p.name || '')).toLowerCase());
        return String(vid).toLowerCase();
      };

      let top = null, bottom = null;
      for (const v of items) {
        const t = getText(v);
        if (!top && topReLocal.test(t)) top = v;
        if (!bottom && bottomReLocal.test(t)) bottom = v;
        if (top && bottom) break;
      }

      // fallback: search compactProducts pool for missing piece(s)
      if (!top) {
        const cand = compactProducts.find(p => {
          const combined = (((p.category || '') + ' ' + (p.name || '')).toLowerCase());
          // absolute reject accessories
          if (p.category_id && accessoryCategoryIdSetLocal.has(String(p.category_id))) return false;
          if (/\b(kính|kinh|túi|tui|ví|vi|phụ kiện|phukien|clutch|wallet|bag|handbag|sunglass|jewelry|jewellery)\b/i.test(combined)) return false;
          return topReLocal.test(combined) && validVariants.has(String(p.variant_id));
        });
        if (cand) top = String(cand.variant_id);
      }
      if (!bottom) {
        const cand = compactProducts.find(p => {
          const combined = (((p.category || '') + ' ' + (p.name || '')).toLowerCase());
          if (p.category_id && accessoryCategoryIdSetLocal.has(String(p.category_id))) return false;
          if (/\b(kính|kinh|túi|tui|ví|vi|phụ kiện|phukien|clutch|wallet|bag|handbag|sunglass|jewelry|jewellery)\b/i.test(combined)) return false;
          return bottomReLocal.test(combined) && validVariants.has(String(p.variant_id));
        });
        if (cand) bottom = String(cand.variant_id);
      }

      if (top && bottom && top !== bottom) return [top, bottom];
      return null;
    };

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
- Nếu user yêu cầu phụ kiện (túi, kính, ví...), và server chưa có giới tính, trả {"ask":"Bạn cần phụ kiện nam hay nữ để mình chọn phù hợp nhé?"}.
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
          size_guides: guidesByCategory,
          products: compactProducts,
          max_outfits: opts.maxOutfits || 3,
         must_include: Array.isArray(opts.keepVariantIds) && opts.keepVariantIds.length ? opts.keepVariantIds : undefined
      }) }
    ];

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
         try {
          const jsonMatch = String(assistantText || '').match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed && Array.isArray(parsed.outfits)) {
              aiOutfits = parsed.outfits;
              console.debug('[aiService] parsed aiOutfits length=', aiOutfits.length);
            } else {
              console.warn('[aiService] assistantText JSON parsed but outfits missing or invalid');
            }
          } else {
            console.debug('[aiService] no JSON block found in assistantText');
          }
        } catch (ex) {
          console.warn('[aiService] failed to parse assistantText JSON', ex && ex.message ? ex.message : ex);
        }
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
    } catch (err) {
      console.warn('OpenAI request failed or timed out, falling back to DB heuristic:', err && err.message ? err.message : err);
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
        // include extra metadata (color, product description) so we can build canonical descriptions
        const namesByVariant = {};
        for (const p of products) {
          namesByVariant[String(p.variant_id)] = {
            name: p.name,
            category_id: p.category_id,
            category_name: (p.category_name || p.category || '').toString(),
            color: (p.color_name || p.color || '') || null,
            product_description: (p.description || '') || null
          };
        }

        const accessoryRe = /\b(kính|kinh|túi|tui|ví|vi|phụ[ -]?kiện|phukien|clutch|wallet|bag|handbag|sunglass|eyewear|purse|jewelry|jewellery)\b/i;
        const topRe = /\b(áo|top|shirt|tee|blouse|sơ mi|hoodie|polo|t-shirt|jacket|coat|áo khoác|đầm|dress)\b/i;
        const bottomRe = /\b(quần|pants|jean|short|skirt|váy|legging|trousers|kaki|chino)\b/i;
        // use `let` because we reassign finalOutfitsToReturn later
        let finalOutfitsToReturn = [];

        // Build accessoryCategoryIdSet robustly:
        // 1) primary: categories with accessory-like slugs/names (fast check)
        // 2) fallback: scan namesByVariant.category_name / product name for accessory keywords
        let accessoryCategoryIdSet = new Set();
        try {
          const namePatterns = ['%phu-kien%','%phụ kiện%','%kính%','%kinh%','%eyewear%','%glasses%','%sunglass%','%ví%','%vi%','%túi%','%bag%','%handbag%'];
          const catQ = await client.query(
            `SELECT id FROM categories WHERE LOWER(slug) ILIKE ANY($1::text[]) OR LOWER(name) ILIKE ANY($1::text[]) LIMIT 50`,
            [namePatterns]
          );
          for (const r of (catQ.rows || [])) accessoryCategoryIdSet.add(String(r.id));
        } catch (e) {
          accessoryCategoryIdSet = new Set();
        }
        // fallback: if categories failed to detect, check products' category_name/name text for accessory cues
        try {
          const accessoryTextRe = /\b(kính|kinh|túi|tui|ví|vi|phụ[ -]?kiện|clutch|wallet|bag|handbag|sunglass|eyewear|purse)\b/i;
          for (const [vid, info] of Object.entries(namesByVariant)) {
            const catName = (info.category_name || '').toString();
            const prodName = (info.name || '').toString();
            if (accessoryTextRe.test(catName + ' ' + prodName) && info.category_id) {
              accessoryCategoryIdSet.add(String(info.category_id));
            }
          }
        } catch (e) { /* ignore */ }
        if (process.env.DEBUG_AI_SERVICE) console.debug('[aiService] accessoryCategoryIdSet built', Array.from(accessoryCategoryIdSet));


        // Ensure we have DB metadata for any variant IDs AI returned but were not in the products snapshot
        const aiVariantIds = new Set();
        for (const o of aiOutfits || []) {
          (o.items || []).forEach(v => { if (v) aiVariantIds.add(String(v)); });
        }
        const missingRaw = Array.from(aiVariantIds).filter(id => !namesByVariant[id]);
        // sanitize: remove surrounding quotes/whitespace and keep only valid UUIDs
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const missingSanitized = missingRaw
          .map(x => String(x || '').trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, ''))
          .filter(x => uuidRe.test(x));
        if (missingSanitized.length > 0) {
          try {
            // use text ANY comparison to be more tolerant about input types from client
            const metaQ = await client.query(
              `SELECT pv.id AS variant_id, p.id AS product_id, p.name, p.category_id, c.name AS category_name, pv.color_name, p.description
               FROM product_variants pv
               JOIN products p ON pv.product_id = p.id
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE pv.id::text = ANY($1::text[])`,
              [missingSanitized]
            );
            for (const r of metaQ.rows) {
              namesByVariant[String(r.variant_id)] = {
                name: r.name || null,
                product_id: r.product_id || null,
                category_id: r.category_id || null,
                category_name: (r.category_name || '').toString(),
                color: (r.color_name || null),
                product_description: (r.description || null)
              };
            }
          } catch (e) {
            console.warn('[aiService] failed to fetch missing variant metadata', e && e.stack ? e.stack : e);
          }
        }
 
        const getCombinedTextForVid = (vid) => {
          const info = namesByVariant[String(vid)] || {};
          const cat = (info.category_name || '').toString();
          const nm = (info.name || '').toString();
          return `${cat} ${nm}`.toLowerCase();
        };

        const ensureTopBottom = (items, maxItems = 4) => {
          if (!Array.isArray(items) || items.length === 0) return null;
          const curText = items.map(v => getCombinedTextForVid(v));
          const hasTop = curText.some(t => topRe.test(t));
          const hasBottom = curText.some(t => bottomRe.test(t));
          if (hasTop && hasBottom) {
            // dedupe to unique categories and preserve order
            return normalizeOutfitItemsGlobal(items, namesByVariant, maxItems);
          }

          // if user explicitly wants accessories, accept as-is (no forcing)
          if (opts.inferredWantsAccessories) return normalizeOutfitItemsGlobal(items, namesByVariant, maxItems);

          // try to add missing pieces from compactProducts using combined name/category matching
          const newItems = items.slice();
          const safeProductCandidate = (pred) => {
            return compactProducts.find(p => {
              const vid = String(p.variant_id);
              if (newItems.includes(vid)) return false;
              // absolute reject: category_id mapped in namesByVariant or product.category belongs to accessoryCategoryIdSet
              const prodCatId = p.category_id || null;
              if (prodCatId && accessoryCategoryIdSet.has(String(prodCatId))) return false;
              const combined = (((p.category || '') + ' ' + (p.name || '')).toLowerCase());
              if (accessoryRe.test(combined)) return false;
              return pred(combined, p);
            });
          };

          if (!hasTop) {
            const cand = safeProductCandidate((combined) => topRe.test(combined));
            if (cand) newItems.unshift(String(cand.variant_id));
          }
          if (!hasBottom) {
            const cand = safeProductCandidate((combined) => bottomRe.test(combined));
            if (cand) newItems.push(String(cand.variant_id));
          }

          // final validation & normalize
          const normalized = normalizeOutfitItemsGlobal(newItems, namesByVariant, maxItems);
          const finalText = normalized.map(v => getCombinedTextForVid(v));
          const finalHasTop = finalText.some(t => topRe.test(t));
          const finalHasBottom = finalText.some(t => bottomRe.test(t));
          if (finalHasTop && finalHasBottom) return normalized;
          return null;
        };

        const filteredSanitized = [];
        for (const out of sanitized) {
          // if user didn't request accessories, filter accessory categories out first
          if (!opts.inferredWantsAccessories) {
            // remove all accessory category items (category_id check preferred)
            out.items = out.items.filter(vid => {
              const info = namesByVariant[String(vid)] || {};
              const cid = info.category_id ? String(info.category_id) : null;
              if (cid && accessoryCategoryIdSet.has(cid)) return false;
              return !accessoryRe.test(((info.category_name||'') + ' ' + (info.name||'')).toLowerCase());
            });
          } else {
            // If accessories allowed, dedupe accessories by category_name/name AND cap accessories to 1
            const accessoriesSeen = new Set();
            let accessoryCount = 0;
            out.items = out.items.filter(vid => {
              const info = namesByVariant[String(vid)] || {};
              const combined = (((info.category_name||'') + ' ' + (info.name||'')).toLowerCase()).trim();
              const isAccessory = accessoryRe.test(combined);
              if (!isAccessory) return true;
              // canonical key to dedupe similar accessories (fallback to name)
              const key = (info.category_name || info.name || '').toLowerCase().replace(/\s+/g,' ').trim();
              if (accessoriesSeen.has(key)) return false;
              // only allow a single accessory per outfit (keep first encountered)
              if (accessoryCount >= 1) return false;
              accessoriesSeen.add(key);
              accessoryCount++;
              return true;
            });
          }

          // try to ensure top+bottom; if can't and user didn't ask accessories -> skip outfit
          const ensured = ensureTopBottom(out.items || []);
          if (!ensured || ensured.length === 0) continue;

          // normalize and limit
          out.items = normalizeOutfitItemsGlobal(ensured, namesByVariant, 4);
          // final guard: require at least one item
          if (Array.isArray(out.items) && out.items.length) filteredSanitized.push(out);
        }

        // When removing accessories, prefer explicit category_id check; fallback to text regex
        for (const out of filteredSanitized) {
          if (!opts.inferredWantsAccessories) {
            out.items = (out.items || []).filter(vid => {
              const info = namesByVariant[String(vid)] || {};
              const cid = info.category_id ? String(info.category_id) : null;
              
              if (cid && accessoryCategoryIdSet.has(cid)) return false;
              const combined = (((info.category_name || '') + ' ' + (info.name || '')).toString()).toLowerCase();
              if (accessoryRe.test(combined)) return false;
              
              return true;
            });
          }
          // debug: if outfit still lacks a Top after filtering, warn with details (helps reproduce)
          const curText = (out.items || []).map(v => getCombinedTextForVid(v));
          const hasTopNow = curText.some(t => topRe.test(t));
          const hasBottomNow = curText.some(t => bottomRe.test(t));
          if (!hasTopNow || !hasBottomNow) {
            console.warn('[aiService.generateOutfitRecommendation] outfit missing top/bottom after accessory-filter', {
              outfitName: out.name,
              itemsBefore: (out.items || []).slice(0,10),
              hasTopNow,
              hasBottomNow
            });
          }
        }

        const processedSanitized = [];
        for (const out of filteredSanitized) {
          const enforced = makeOneTopOneBottom(out.items || []);
          if (!enforced) continue; // drop outfits we cannot reduce to top+bottom
          out.items = enforced;
          processedSanitized.push(out);
        }

        finalOutfitsToReturn = [];
        for (const out of processedSanitized) {
          // normalize and re-verify Top/Bottom
          const namesForItems = out.items.map(vid => ({ vid, text: ((namesByVariant[String(vid)]?.category_name || '') + ' ' + (namesByVariant[String(vid)]?.name || '')).toLowerCase() }));
          const hasTop = namesForItems.some(x => /\b(áo|top|shirt|tee|blouse|sơ mi|áo len|hoodie|polo|t-shirt|jacket|coat|đầm|dress)\b/i.test(x.text));
          const hasBottom = namesForItems.some(x => /\b(quần|pants|jean|short|skirt|váy|legging|trousers|kaki|chino)\b/i.test(x.text));
          // if missing top or bottom -> try to pull from compactProducts (non-accessory)
          if (!hasTop || !hasBottom) {
            const neededTop = !hasTop;
            const neededBottom = !hasBottom;
            const added = [];
            if (neededTop) {
              const cand = compactProducts.find(p => {
                if (!validVariants.has(String(p.variant_id))) return false;
                if (p.category_id && accessoryCategoryIdSet.has(String(p.category_id))) return false;
                return /\b(áo|top|shirt|tee|blouse|sơ mi|áo len|hoodie|polo|t-shirt|jacket|coat|đầm|dress)\b/i.test(((p.category||'') + ' ' + (p.name||'')).toLowerCase());
              });
              if (cand) added.push(String(cand.variant_id));
            }
            if (neededBottom) {
              const cand = compactProducts.find(p => {
                if (!validVariants.has(String(p.variant_id))) return false;
                if (p.category_id && accessoryCategoryIdSet.has(String(p.category_id))) return false;
                return /\b(quần|pants|jean|short|skirt|váy|legging|trousers|kaki|chino)\b/i.test(((p.category||'') + ' ' + (p.name||'')).toLowerCase());
              });
              if (cand) added.push(String(cand.variant_id));
            }
            out.items = [...new Set([...added, ...out.items])];
          }
          // now remove accessory items if user didn't request accessories
          if (!opts.inferredWantsAccessories) {
            out.items = out.items.filter(vid => {
              const info = namesByVariant[String(vid)] || {};
              const cid = info.category_id ? String(info.category_id) : null;
              if (cid && accessoryCategoryIdSet.has(cid)) return false;
              const combined = (((info.category_name || '') + ' ' + (info.name || '')).toString()).toLowerCase();
              if (accessoryRe.test(combined)) return false;
              return true;
            });
          } else {
            // cap accessories to 1 and dedupe similar accessories
            const accSeen = new Set();
            const newItems = [];
            for (const vid of out.items) {
              const info = namesByVariant[String(vid)] || {};
              const combined = (((info.category_name || '') + ' ' + (info.name || '')).toString()).toLowerCase();
              const isAcc = accessoryRe.test(combined) || (info.category_id && accessoryCategoryIdSet.has(String(info.category_id)));
              if (isAcc) {
                const key = (info.category_name || info.name || '').toLowerCase().replace(/\s+/g,' ').trim();
                if (accSeen.has(key)) continue;
                if (accSeen.size >= 1) continue;                
                accSeen.add(key);
                newItems.push(vid);
              } else {
                newItems.push(vid);
              }
            }
            out.items = newItems;
          }

          // final Top+Bottom check -> normalize to exactly one top+one bottom (keep order)
          const enforced = makeOneTopOneBottom(out.items || [], namesByVariant, accessoryCategoryIdSet);
          if (enforced && enforced.length >= 2) {
            // attach accessory (if allowed and exists among original items) up to 1
            if (opts.inferredWantsAccessories) {
              const acc = (out.items || []).find(vid => {
                const info = namesByVariant[String(vid)] || {};
                const combined = (((info.category_name||'') + ' ' + (info.name||'')).toLowerCase());
                const cid = info.category_id ? String(info.category_id) : null;
                if (cid && accessoryCategoryIdSet.has(cid)) return true;
                return accessoryRe.test(combined);
              });
              if (acc && !enforced.includes(acc)) enforced.push(acc);
            }
            out.items = enforced.slice(0, 3);
            finalOutfitsToReturn.push(out);
          }
        }
        // limited final set
        const limitedSanitized = finalOutfitsToReturn.slice(0, Math.max(1, opts.maxOutfits || 1));

        // limit final outfits (server generally returns 1; keep opts.maxOutfits fallback)
        //const limitedSanitized = processedSanitized.slice(0, Math.max(1, opts.maxOutfits || 1));
        //const accessoryRe = /\b(kính|kinh|túi|tui|ví|vi|phụ kiện|phukien|clutch|wallet|bag|handbag|sunglass|jewelry|jewellery)\b/i;
        const finalCleaned = [];
        for (const out of limitedSanitized) {
          const enforced = makeOneTopOneBottom(out.items || []);
          if (!enforced || enforced.length < 2) continue; // drop if we still can't get top+bottom
          // if accessories allowed, try to add a single accessory (prefer those already present in out.items)
          if (opts.inferredWantsAccessories) {
            const acc = (out.items || []).find(vid => {
              const info = namesByVariant[String(vid)] || {};
              const combined = (((info.category_name||'') + ' ' + (info.name||'')).toLowerCase());
              const cid = info.category_id ? String(info.category_id) : null;
              if (cid && accessoryCategoryIdSet.has(cid)) return true;
              return accessoryRe.test(combined);
            });
            if (acc && !enforced.includes(acc)) enforced.push(acc);
          }
          // ensure max 3 items (top,bottom,maybe accessory)
          out.items = enforced.slice(0, 3);
          finalCleaned.push(out);
        }

        // use finalCleaned instead of limitedSanitized downstream
        finalOutfitsToReturn = finalCleaned;
        for (const out of finalOutfitsToReturn) {
          // create readable fragment per item
          const firstTwo = (out.items || []).slice(0, 2);
          const fragments = firstTwo.map((vid) => {
            const info = namesByVariant[String(vid)] || {};
            const nm = info.name || vid;
            const colorPart = info.color ? (`màu ${info.color}`) : '';
            const shortDesc = info.product_description ? (String(info.product_description).split('.').slice(0,1).join('.').trim()) : null;
            return {
              text: `${nm}${colorPart ? ' (' + colorPart + ')' : ''}`,
              shortDesc
            };
          });

          const main = fragments[0] ? fragments[0].text : '';
          const secondary = fragments[1] ? `kết hợp với ${fragments[1].text}` : '';
          const materialSentence = fragments[0] && fragments[0].shortDesc ? `${fragments[0].shortDesc}.` : `Chất liệu thoáng mát và dễ chịu.`;
          const secondarySentence = fragments[1] && fragments[1].shortDesc ? `${fragments[1].shortDesc}.` : null;

          // canonical description: combine main + short desc of both items, accessory hint, CTA
          const canonicalDescParts = [
            `${main} ${secondary}`.trim() + '.',
            materialSentence,
            secondarySentence,
            `Phối thêm phụ kiện nhỏ như túi xách hoặc kính phù hợp để hoàn thiện set.`,
            `Bạn muốn mình chọn size phù hợp không?`
          ].filter(Boolean);
          const canonicalDesc = canonicalDescParts.join(' ');
          out.description = canonicalDesc;
        }

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

        // === TÁCH RIÊNG TEXT + FOLLOW-UP ===
        let cleanReply = finalOutfitsToReturn.length
                ? finalOutfitsToReturn.map((o, idx) => `${o.name} — ${o.description}`).join('\n\n')
                : `Mình đã gợi ý ${limitedSanitized.length} set cho bạn.`;
        // Tạo followUp riêng cho FE render nút bấm
        const followUp = {
          question: '',
          quickReplies: []
        };

        if (wantsSizeButMissingMeasurements) {
          followUp.question = 'Bạn cho mình biết chiều cao và cân nặng (cm/kg) để mình tư vấn size chính xác nhé?';
          followUp.quickReplies = ['Oke luôn', 'Để sau nha'];
        } 
        else if (userHasMeasurements) {
          followUp.question = 'Bạn muốn mình chọn size phù hợp không?';
          followUp.quickReplies = ['Chọn size giúp mình', 'Xem thêm outfit', 'Đủ rồi, cảm ơn Luna!'];
        } 
        else {
          followUp.question = 'Bạn có muốn xem thêm 1 outfit khác không?';
          followUp.quickReplies = ['Xem thêm', 'Đủ rồi, cảm ơn!'];
        }

        // Lưu vào DB: content (text sạch) + metadata (outfit sạch)
        if (opts.sessionId) {
          await client.query(
            `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) 
            VALUES ($1, 'assistant', $2, $3::jsonb, NOW())`,
            [
              opts.sessionId,
              cleanReply,
              JSON.stringify({ outfits: finalOutfitsToReturn, followUp, context: { occasion, weather } }) // lưu cả followUp để FE load lại
            ]
          );
          await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [opts.sessionId]);
        }
        const storedOutfits = finalOutfitsToReturn.map(o => {
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

        await client.query('COMMIT');
        txStarted = false;
        return {
          type: 'outfit_suggestions',
          reply: cleanReply, 
          outfits: finalOutfitsToReturn, 
          followUp, 
          sessionId: opts.sessionId || null,
          _persistedByGenerator: Boolean(opts.sessionId)
       };
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

      const title = namesById[normalizedItems[0]] ? `${namesById[normalizedItems[0]].category_name || 'Outfit'}: ${namesById[normalizedItems[0]].product_name}` : `Outfit ${i+1}`;
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

    const cleanedFallback = [];
    for (const o of (outfits.length ? [outfits[0]] : [])) {
      const enforced = makeOneTopOneBottom(o.items || []);
      if (!enforced || enforced.length < 2) continue;
      // try to avoid accessory picks in fallback: remove accessory-like items
      o.items = enforced;
      cleanedFallback.push(o);
    }
    const finalOutfits = cleanedFallback.length ? [cleanedFallback[0]] : [];

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
  const accessoriesKey = ['phụ kiện','túi','ví','kính','mắt kính'];
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

    // persist user message only if valid
    let _userMessagePersisted = false;
    if (sessionId && message && String(message).trim().length) {
      try {
        await client.query(
          `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'user', $2, NOW())`,
          [sessionId, String(message).trim()]
        );
        await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
        _userMessagePersisted = true;
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] persist user message failed', e && e.stack ? e.stack : e);
      }
    }

    // load last recommendation for contextual resolution (if any)
    let lastRec = null;
    if (lastRecommendationAllowed) {
      try {
        // include context so downstream "show more" can reuse occasion/weather without extra queries
        const recQ = await client.query(
          `SELECT id, items, context, created_at FROM ai_recommendations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        if (recQ.rowCount > 0) lastRec = recQ.rows[0];
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] load last recommendation failed', e && e.stack ? e.stack : e);
      }
    }

    // Debug: surface lastRec content so we can see if context exists / is parseable
    try {
      if (lastRec) {
        const itemsPreview = typeof lastRec.items === 'string' ? (lastRec.items || '').slice(0,200) : JSON.stringify(lastRec.items || {}).slice(0,200);
        console.debug('[aiService.handleGeneralMessage] lastRec loaded', { id: lastRec.id, contextRaw: lastRec.context, itemsPreview });
        let ctx = null;
        try { ctx = (typeof lastRec.context === 'string') ? JSON.parse(lastRec.context) : lastRec.context; } catch(e){ ctx = lastRec.context; }
        console.debug('[aiService.handleGeneralMessage] lastRec parsed context', ctx);
      } else {
        console.debug('[aiService.handleGeneralMessage] no lastRec found for user', { userId });
      }
    } catch (logErr) { /* ignore logging errors */ }
    
    let lastAccessoryRec = null;
    try {
      lastAccessoryRec = await exports.getLastRecommendationForUser(userId, 'accessories');
    } catch (e) { lastAccessoryRec = null; }

    const lowerMsg = String(message || '').toLowerCase();
    const slotHints = (typeof extractSlotsFromMessage === 'function') ? extractSlotsFromMessage(message || '') : {};

    if (process.env.DEBUG_AI_SERVICE) {
      try {
        console.debug('[aiService.handleGeneralMessage.DEBUG] incoming message (raw):', String(message).slice(0,1000));
        console.debug('[aiService.handleGeneralMessage.DEBUG] lowerMsg:', lowerMsg);
        console.debug('[aiService.handleGeneralMessage.DEBUG] slotHints:', slotHints);
        console.debug('[aiService.handleGeneralMessage.DEBUG] lastRec (preview):', lastRec ? { id: lastRec.id, context: lastRec.context } : null);
        console.debug('[aiService.handleGeneralMessage.DEBUG] lastAccessoryRec (preview):', lastAccessoryRec ? { id: lastAccessoryRec.id, itemsPreview: (typeof lastAccessoryRec.items === "string" ? lastAccessoryRec.items.slice(0,200) : JSON.stringify(lastAccessoryRec.items || {}).slice(0,200)) } : null);
      } catch (e) { console.error('[aiService.DEBUG] safe debug log failed', e && e.stack ? e.stack : e); }
    }
    let sessionHistory = [];
    try {
      sessionHistory = await loadSessionHistory(client, sessionId, 60) || [];
      sessionHistory = Object.freeze(sessionHistory);
    } catch (e) {
      console.error('[aiService.handleGeneralMessage] load session history failed', e && e.stack ? e.stack : e);
      sessionHistory = Object.freeze([]);
    }
    // Nhận số đo người dùng và hai hành động khả dụng:
    // - opts.silentSave = true: lưu nhưng KHÔNG trả về ack (tiếp tục luồng)
    // - opts.suggestSizeImmediately = true: lưu rồi gọi luồng tư vấn size ngay, trả về kết quả
    try {
      const m = String(message || '');
      // "170cm 64kg", "170 64", "1m7 và 64kg", "1m70", "1.7m 64", "mình cao 1m7 và nặng 64kg"
      const parseMeasurementsFromText = (text = '') => {
        const s = String(text || '').toLowerCase();
        let height = null;
        let weight = null;

        // 1) Compact meter forms: "1m7", "1m70", "1.70m", "1,7m"
        const compactM = s.match(/(\d{1,3})m(\d{1,2})\b/);
        if (compactM) {
          const a = Number(compactM[1]);
          const b = Number(compactM[2]);
          if (!Number.isNaN(a) && !Number.isNaN(b)) {
            height = a * 100 + (b < 10 ? b * 10 : b); // "1m7" -> 170
          }
        }

        // 2) Decimal meter forms: "1.7m" or "1,7m"
        if (!height) {
          const decM = s.match(/(\d+(?:[.,]\d{1,2}))\s?m\b/);
          if (decM) {
            const n = Number(decM[1].replace(',', '.'));
            if (!Number.isNaN(n)) height = Math.round(n * 100);
          }
        }

        // 3) cm explicit: "170cm"
        if (!height) {
          const cm = s.match(/(\d{2,3})\s?cm\b/);
          if (cm) height = Number(cm[1]);
        }

        // 4) weight explicit: "64kg"
        const kg = s.match(/(\d{2,3})\s?kg\b/);
        if (kg) weight = Number(kg[1]);

        // 5) "nặng 64" or "nặng 64kg"
        if (!weight) {
          const nang = s.match(/nặng\s*(\d{2,3})(?:\s?kg)?\b/);
          if (nang) weight = Number(nang[1]);
        }

        // 6) fallback: find numeric tokens and infer by plausible ranges
        if ((!height || !weight)) {
          const numPattern = /(\d{1,3}(?:[.,]\d{1,2})?)(?:\s?(cm|kg|m))?/g;
          const found = [];
          let mTok;
          while ((mTok = numPattern.exec(s)) !== null) {
            found.push({ val: mTok[1].replace(',', '.'), unit: mTok[2] || null });
          }

          for (const f of found) {
            const n = Number(f.val);
            if (f.unit === 'cm' && !height) height = Math.round(n);
            else if (f.unit === 'kg' && !weight) weight = Math.round(n);
            else if (f.unit === 'm' && !height) height = Math.round(n * 100);
          }

          // if still missing, use heuristics: centimeter-range for height, kg-range for weight
          const nums = found.map(f => Number(f.val)).filter(x => !Number.isNaN(x));
          if (!height && nums.length) {
            const hCand = nums.find(x => x >= 100 && x <= 230);
            if (hCand) height = Math.round(hCand);
            else {
              const mCand = nums.find(x => x > 1 && x < 3); // likely in meters like 1.7
              if (mCand) height = Math.round(mCand * 100);
            }
          }
          if (!weight && nums.length) {
            const wCand = nums.find(x => x >= 30 && x <= 250 && x !== height);
            if (wCand) weight = Math.round(wCand);
          }
        }

        // simple sanity check
        if (height && (height < 50 || height > 300)) height = null;
        if (weight && (weight < 20 || weight > 500)) weight = null;

        if (height || weight) return { height, weight };
        return null;
      };

      const mm = parseMeasurementsFromText(m);
      if (mm) {
        const height = mm.height;
        const weight = mm.weight;
        if (!Number.isNaN(height) && !Number.isNaN(weight)) {
          try {
            // lưu trực tiếp vào users
            await client.query(`UPDATE users SET height = $1, weight = $2 WHERE id = $3`, [height, weight, userId]);
            // Reuse sessionHistory loaded earlier (top of handler). Also fetch recent assistant messages
            // including metadata because follow-up question may be stored in metadata.followUp.question.
            const measurementRegex = /\b(chiều cao|cân nặng|cm\/kg|cho mình biết chiều cao|cho mình biết chiều cao và cân nặng|tư vấn size|để mình tư vấn size|chọn\s*size|chọn\s*size\s*giúp|bạn.*chọn\s*size|muốn\s*mình\s*chọn\s*size)\b/i;

            // sessionHistory (chronological) was loaded near the top of the function into `sessionHistory`.
            const recentFromHistory = Array.isArray(sessionHistory) && sessionHistory.length > 0
              ? sessionHistory.slice(-6).reverse() // examine last few messages (most recent last)
              : [];

            // also pull last assistant rows including metadata (defensive)
            let recentAssistantRows = [];
            try {
              if (sessionId) {
                const aQ = await client.query(
                  `SELECT content, metadata FROM ai_chat_messages WHERE session_id = $1 AND role = 'assistant' ORDER BY created_at DESC LIMIT 6`,
                  [sessionId]
                );
                recentAssistantRows = aQ.rows || [];
              }
            } catch (e) {
              console.error('[aiService.handleGeneralMessage] fetch recent assistant rows failed', e && e.stack ? e.stack : e);
              recentAssistantRows = [];
            }

            const assistantAskedForMeasurements = (
              // check textual assistant messages in sessionHistory
              recentFromHistory.some(m => m.role === 'assistant' && measurementRegex.test(String(m.content || '')))
              ||
              // check DB assistant rows content + metadata JSON (followUp.question, metadata.followUp, metadata)
              recentAssistantRows.some(r => {
                try {
                  const txt = String(r.content || '');
                  if (measurementRegex.test(txt)) return true;
                  const meta = r.metadata;
                  if (!meta) return false;
                  const j = (typeof meta === 'string') ? JSON.parse(meta) : meta;
                  // check common metadata locations
                  const candidates = [];
                  if (j && typeof j === 'object') {
                    if (j.followUp && typeof j.followUp === 'object' && j.followUp.question) candidates.push(String(j.followUp.question));
                    if (j.question) candidates.push(String(j.question));
                    if (j.size_prompt) candidates.push(String(j.size_prompt));
                    // fallback: stringify metadata
                    candidates.push(JSON.stringify(j));
                  }
                  return candidates.some(c => measurementRegex.test(String(c || '')));
                } catch (ex) {
                  return false;
                }
              })
            );

            const triggerSizeFlow = (opts && opts.silentSave) || (lastRec && assistantAskedForMeasurements);

            if (triggerSizeFlow){
              // Nếu silentSave: sau khi lưu, tiếp tục và chạy luồng "Chọn size giúp mình"
              try {
                let last = lastRec;
                if (!last) last = await exports.getLastRecommendationForUser(userId);
                if (!last) {
                  // không có recommendation trước đó -> tiếp tục xử lý bình thường (no ACK)
                } else {
                  let recJson = last.items;
                  if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch(e) { recJson = null; } }
                  const outfits = recJson && recJson.outfits ? recJson.outfits : [];
                  if (outfits.length === 0) {
                    // không có outfit -> tiếp tục bình thường
                  } else {
                    const selected = outfits[0];
                    const variantIds = Array.isArray(selected.items) ? selected.items : [];
                    if (variantIds.length === 0) {
                      // không có variant rõ ràng -> tiếp tục bình thường
                    } else {
                      // Lấy measurements (vừa update ở trên nên có)
                      const uQ = await client.query(`SELECT height, weight, bust, waist, hip FROM users WHERE id = $1 LIMIT 1`, [userId]);
                      const u = uQ.rows[0];
                      if (!u || (!u.height && !u.weight && !u.bust && !u.waist && !u.hip)) {
                        const ask = 'Bạn cho mình biết chiều cao và cân nặng (cm/kg) để mình tư vấn size chính xác nhé?';
                        if (sessionId) await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, ask]);
                        return { ask, sessionId };
                      }

                      // load categories for variants and size guides
                      const pvQ = await client.query(
                        `SELECT pv.id AS variant_id, p.category_id
                         FROM product_variants pv JOIN products p ON pv.product_id = p.id
                         WHERE pv.id = ANY($1::uuid[])`,
                        [variantIds]
                      );
                      const catMap = {};
                      pvQ.rows.forEach(r => { catMap[String(r.variant_id)] = r.category_id; });
                      const catIds = Array.from(new Set(Object.values(catMap).filter(Boolean)));
                      const guidesByCategoryLocal = {};
                      if (catIds.length) {
                        const sgQ = await client.query(`SELECT category_id, size_label, min_height, max_height, min_weight, max_weight, bust, waist, hip FROM size_guides WHERE category_id = ANY($1::uuid[])`, [catIds]);
                        for (const g of sgQ.rows) {
                          guidesByCategoryLocal[g.category_id] = guidesByCategoryLocal[g.category_id] || [];
                          guidesByCategoryLocal[g.category_id].push(g);
                        }
                      }
                      // compute suggestions
                      const suggestions = variantIds.map(vid => {
                        const cid = catMap[String(vid)];
                        const guides = cid ? (guidesByCategoryLocal[cid] || []) : [];
                        const sz = pickSizeFromGuides(guides, u) || null;
                        return { variant_id: String(vid), suggested_size: sz };
                      });

                      // Lấy tên + màu cho các variant để hiển thị thân thiện
                      const vIds = suggestions.map(s => s.variant_id);
                      let namesMap = {};
                      try {
                        const nQ = await client.query(
                          `SELECT pv.id AS variant_id, p.name AS product_name, pv.color_name
                           FROM product_variants pv JOIN products p ON pv.product_id = p.id
                           WHERE pv.id = ANY($1::uuid[])`,
                          [vIds]
                        );
                        for (const r of (nQ.rows || [])) {
                          namesMap[String(r.variant_id)] = { product_name: r.product_name, color: r.color_name };
                        }
                      } catch (e) { /* ignore */ }

                      const lines = suggestions.map(s => {
                        const info = namesMap[s.variant_id] || {};
                        const name = info.product_name || s.variant_id;
                        const color = info.color_name ? ` (${info.color_name})` : '';
                        return `${name}${color} → ${s.suggested_size || 'Không rõ'}`;
                      });
                      const reply = `Mình gợi ý size cho bộ bạn vừa chọn: ${lines.join('; ')}. Nếu bạn muốn mặc rộng hơn thì tăng 1 size nhé.`;
                      if (sessionId) {
                        await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) VALUES ($1,'assistant',$2,$3::jsonb,NOW())`, [sessionId, reply, JSON.stringify({ size_suggestions: suggestions })]);
                        await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
                      }
                      return {
                        type: 'size_suggestions',
                        reply,
                        sizeSuggestions: suggestions,
                        metadata: { size_suggestions: suggestions },
                        sessionId
                      };
                    }
                  }
                }
              } catch (e) {
                console.error('[aiService.handleGeneralMessage] silentSave -> choose-size flow failed', e && e.stack ? e.stack : e);
                // on error: fall through to normal flow without ACK
              }
            } else {
              // Mặc định: trả về confirmation đơn giản, KHÔNG hỏi follow-up hay gợi ý size
              const ack = `Mình đã lưu chiều cao ${height}cm và cân nặng ${weight}kg.`;
              if (sessionId) {
                await client.query(
                  `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`,
                  [sessionId, ack]
                );
                await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
              }
              return { reply: ack, sessionId };
            }
          } catch (e) {
            console.error('[aiService.handleGeneralMessage] save measurements failed', e && e.stack ? e.stack : e);
            // nếu lưu thất bại thì tiếp tục luồng xử lý (không throw ở đây)
          }
        }
      }

      // const retrieveOutfitIntent = /\b(gửi lại thông tin outfit|gửi lại thông tin của outfit|cho mình xin lại thông tin|cho mình xin lại thông tin của outfit|gửi lại thông tin|xin lại thông tin outfit)\b/i;
      // if (retrieveOutfitIntent.test(lowerMsg)) {
      //   try {
      //     const res = await exports.retrieveLastOutfitDetails(userId, sessionId);
      //     if (res.ask) return { ask: res.ask, sessionId };
      //     return { reply: res.reply, outfit: res.outfit, items: res.items, sessionId };
      //   } catch (e) {
      //     console.error('[aiService.handleGeneralMessage] retrieveOutfitIntent failed', e && e.stack ? e.stack : e);
      //     return { reply: 'Mình không lấy được thông tin outfit lúc này, thử lại sau nhé!', sessionId };
      //   }
      // }

      const retrieveIntent = /\b(gửi lại thông tin|gửi lại|gửi lại thông tin của|gửi lại thông tin cái|gửi lại thông tin món|gửi lại thông tin mẫu|gửi lại)\b/i;
      if (retrieveIntent.test(lowerMsg)) {
        try {
          // prefer item-level retrieval (cái áo / cái quần / món 1) -> falls back to full outfit
          const itemRes = await exports.retrieveLastItemDetails(userId, sessionId, message);
          if (itemRes && (itemRes.reply || itemRes.ask)) {
            // if function asked for clarification, surface ask
            if (itemRes.ask) return { ask: itemRes.ask, sessionId };
            return { reply: itemRes.reply, item: itemRes.item, sessionId };
          }
          // fallback: retrieve whole outfit
          const res = await exports.retrieveLastOutfitDetails(userId, sessionId);
          if (res.ask) return { ask: res.ask, sessionId };
          return { reply: res.reply, outfit: res.outfit, items: res.items, sessionId };
        } catch (e) {
          console.error('[aiService.handleGeneralMessage] retrieveIntent failed', e && e.stack ? e.stack : e);
          return { reply: 'Mình không lấy được thông tin outfit lúc này, thử lại sau nhé!', sessionId };
        }
      }
    } catch (e) { /* ignore parse errors */ }
    

  function normalizeForMatching(s = '') {
  return String(s || '')
    .normalize('NFD')                     // decompose accents
    .replace(/[\u0300-\u036f]/g, '')      // remove diacritics
    .replace(/[^a-z0-9\s]/gi, ' ')        // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  }

  function isGratitude(text = '') {
    const norm = normalizeForMatching(text);
    if (!norm) return false;
    // common normalized variants (include Vietnamese without diacritics + common english shortcuts)
    const variants = [
      'cam on','camon','camr on','camonw','cam onw',
      'cam on luna','cam on ban','cam on bạn','cam on luna',
      'cam onk','cam onk', // tolerate stray chars
      'cam on', 'camon', 'cảm ơn' /* defensive */,
      'thank you','thanks','ty','tks','tnx'
    ];
    for (const v of variants) {
      if (norm.indexOf(v) !== -1) return true;
    }
    // fallback: simple heuristics: contains "cam" and "on" close by or contains "camon" or "cam" + "on"
    if (/\bcam\w{0,3}\s*on\b/.test(norm) || /\bcamon\w*\b/.test(norm)) return true;
    if (/\bthanks?\b/.test(norm) || /\btks\b/.test(norm) || /\btnx\b/.test(norm)) return true;
    return false;
  }

    // handle "Chọn size giúp mình", "Xem thêm outfit", "Đủ rồi, cảm ơn Luna!"
    try {
      // 1) Choose size flow
      if (/\bchọn\s*size\s*giúp\s*mình\b/i.test(lowerMsg)) {
        // ensure we have last recommendation
        let last = lastRec;
        if (!last) last = await exports.getLastRecommendationForUser(userId);
        if (!last) return { ask: 'Mình chưa có set nào trước đó. Bạn muốn mình tìm vài set để chọn không?', sessionId };

        let recJson = last.items;
        if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch(e) { recJson = null; } }
        const outfits = recJson && recJson.outfits ? recJson.outfits : [];
        if (!outfits.length) return { ask: 'Mình chưa có outfit trước đó để tư vấn size. Bạn muốn mình gợi ý outfit mới không?', sessionId };

        const selected = outfits[0];
        const variantIds = Array.isArray(selected.items) ? selected.items : [];
        if (!variantIds.length) return { ask: 'Mình chưa có món rõ ràng để tư vấn size. Bạn có thể chọn 1 mẫu cụ thể không?', sessionId };

        // user measurements
        const uQ = await client.query(`SELECT height, weight, bust, waist, hip FROM users WHERE id = $1 LIMIT 1`, [userId]);
        const u = uQ.rows[0];
        if (!u || (!u.height && !u.weight && !u.bust && !u.waist && !u.hip)) {
          const ask = 'Bạn cho mình biết chiều cao và cân nặng (cm/kg) để mình tư vấn size chính xác nhé?';
          if (sessionId) await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, ask]);
          return { ask, sessionId };
        }

        // load categories for variants and size guides
        const pvQ = await client.query(
          `SELECT pv.id AS variant_id, p.category_id
           FROM product_variants pv JOIN products p ON pv.product_id = p.id
           WHERE pv.id = ANY($1::uuid[])`,
          [variantIds]
        );
        const catMap = {};
        pvQ.rows.forEach(r => { catMap[String(r.variant_id)] = r.category_id; });
        const catIds = Array.from(new Set(Object.values(catMap).filter(Boolean)));
        const guidesByCategoryLocal = {};
        if (catIds.length) {
          const sgQ = await client.query(`SELECT category_id, size_label, min_height, max_height, min_weight, max_weight, bust, waist, hip FROM size_guides WHERE category_id = ANY($1::uuid[])`, [catIds]);
          for (const g of sgQ.rows) {
            guidesByCategoryLocal[g.category_id] = guidesByCategoryLocal[g.category_id] || [];
            guidesByCategoryLocal[g.category_id].push(g);
          }
        }

        // compute suggestions
        const suggestions = variantIds.map(vid => {
          const cid = catMap[String(vid)];
          const guides = cid ? (guidesByCategoryLocal[cid] || []) : [];
          const sz = pickSizeFromGuides(guides, u) || null;
          return { variant_id: String(vid), suggested_size: sz };
        });

        const vIds = suggestions.map(s => s.variant_id);
        let namesMap = {};
        try {
          const nQ = await client.query(
            `SELECT pv.id AS variant_id, p.name AS product_name, pv.color_name
             FROM product_variants pv JOIN products p ON pv.product_id = p.id
             WHERE pv.id = ANY($1::uuid[])`,
            [vIds]
          );
          for (const r of (nQ.rows || [])) {
            namesMap[String(r.variant_id)] = { product_name: r.product_name, color: r.color_name };
          }
        } catch (e) { /* ignore */ }

        const lines = suggestions.map(s => {
          const info = namesMap[s.variant_id] || {};
          const name = info.product_name || s.variant_id;
          const color = info.color_name ? ` (${info.color_name})` : '';
          return `${name}${color} → ${s.suggested_size || 'Không rõ'}`;
        });
        const reply = `Mình gợi ý size cho bộ bạn vừa chọn: ${lines.join('; ')}. Nếu bạn muốn mặc rộng hơn thì tăng 1 size nhé.`;
        if (sessionId) {
          await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) VALUES ($1,'assistant',$2,$3::jsonb,NOW())`, [sessionId, reply, JSON.stringify({ size_suggestions: suggestions })]);
          await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
        }
        return { 
          type: 'size_suggestions',
          reply, 
          sizeSuggestions: suggestions, metadata: { size_suggestions: suggestions },
          sessionId };
      }

      // 2) Show more outfit -> reuse last recommendation context and exclude previous variants
      if (/\bxem\s*thêm\s*outfit\b/i.test(lowerMsg) || /\bxem\s*thêm\b/i.test(lowerMsg)) {
        let last = lastRec;
        if (!last) last = await exports.getLastRecommendationForUser(userId);
        const excludeIds = [];
        let occasionFromContext = null, weatherFromContext = null;
        if (last) {
          let recJson = last.items;
          if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch(e) { recJson = null; } }
          const outfits = recJson && recJson.outfits ? recJson.outfits : [];
          for (const o of outfits) if (Array.isArray(o.items)) excludeIds.push(...o.items.map(i => String(i)));
          try {
            const ctx = typeof last.context === 'string' ? JSON.parse(last.context) : last.context;
            occasionFromContext = ctx?.occasion || null;
            weatherFromContext = ctx?.weather || null;
          } catch (e) { /* ignore */ }
        }

        try {
          const rec = await exports.generateOutfitRecommendation(userId, occasionFromContext, weatherFromContext, { sessionId, maxOutfits: 1, excludeVariantIds: excludeIds, more: true });
          if (rec && rec.outfits && rec.outfits.length) return { reply: rec.reply || 'Mình gợi ý thêm 1 set cho bạn.', outfits: rec.outfits, followUp: rec.followUp || null, sessionId };
          return { reply: 'Mình chưa tìm được set khác, bạn muốn thử phong cách khác không?', outfits: [], sessionId };
        } catch (e) {
          console.error('[aiService.handleGeneralMessage] quickReply showMore failed', e && e.stack ? e.stack : e);
          return { reply: 'Mình không tìm được set mới ngay bây giờ, thử lại sau nhé!', outfits: [], sessionId };
        }
      }

      // 2.1. Xử lý quickreply "Oke luôn"
      // -- NEW: handle quick replies like "Mẫu 1", "Mẫu 2", ... and "Không thích cái nào"
      //    - Lưu hành động user vào ai_recommendations (context.items) để audit / reuse
      //    - Nếu user chọn mẫu N -> trả chi tiết + persist metadata
      //    - Nếu user "Không thích cái nào" -> gọi suggestAccessories lại với excludeVariantIds
      const sampleMatch = String(message || '').match(/\bmẫu\s*(\d+)\b/i);
      if (sampleMatch) {
        const selIdx = Math.max(0, Number(sampleMatch[1]) - 1);

        // Try to ensure we have a sessionId to persist chat history; fallback: find latest session for user
        let persistSessionId = sessionId || null;
        if (!persistSessionId) {
          try {
            const sRes = await client.query(
              `SELECT id FROM ai_chat_sessions WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 1`,
              [userId]
            );
            if (sRes.rowCount > 0) persistSessionId = sRes.rows[0].id;
          } catch (e) {
            console.warn('[aiService.handleGeneralMessage] failed to recover sessionId for persistence', e && e.stack ? e.stack : e);
            persistSessionId = null;
          }
        }

        // persist user's quick-reply into ai_chat_messages only when we have a session to write to
        if (persistSessionId && !_userMessagePersisted && message && String(message).trim()) {
          try {
            await client.query(
              `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'user', $2, NOW())`,
              [persistSessionId, String(message).trim()]
            );
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [persistSessionId]);
            _userMessagePersisted = true;
          } catch (e) {
            console.warn('[aiService.handleGeneralMessage] persist sample quick-reply user message failed', e && e.stack ? e.stack : e);
          }
        }

        try {
          // Load last accessory recommendation (no change)
          const last = await exports.getLastRecommendationForUser(userId, 'accessories');
          if (!last) {
            const ask = 'Mình chưa tìm mẫu phụ kiện nào trước đó. Bạn muốn mình tìm vài mẫu không?';
            if (persistSessionId) {
              try {
                await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [persistSessionId, ask]);
                await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [persistSessionId]);
              } catch (e) { /* non-fatal */ }
            }
            // still persist user action for analytics even without session
            try {
              // pass objects (pg will serialize to jsonb) and log errors if any
              const ctx = { action: 'accessory_select', source: 'quick_reply', sessionId: persistSessionId };
              const items = { selected: null };
              await client.query(
                `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
                 VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
                [userId, ctx, items, 'user-action']
              );
            } catch (e) {
              console.warn('[aiService.handleGeneralMessage] ai_recommendations insert failed (no-last)', e && e.stack ? e.stack : e);
            }
            return { ask, sessionId: persistSessionId };
          }

          let recJson = last.items;
          if (typeof recJson === 'string') {
            try { recJson = JSON.parse(recJson); } catch (e) { recJson = recJson || {}; }
          }
          const accessories = (recJson && recJson.accessories) ? recJson.accessories : [];
          if (!accessories || accessories.length === 0) {
            const ask = 'Mình không tìm thấy mẫu cũ để chọn lại. Bạn muốn mình tìm vài mẫu không?';
            if (persistSessionId) {
              try {
                await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [persistSessionId, ask]);
                await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [persistSessionId]);
              } catch (e) { /* non-fatal */ }
            }
            // persist analytics even without session
            try {
              const ctx2 = { action: 'accessory_select_missing', sessionId: persistSessionId };
              const items2 = { accessories: [] };
              await client.query(
                `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
                 VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
                [userId, ctx2, items2, 'user-action']
              );
            } catch (e) {
              console.warn('[aiService.handleGeneralMessage] ai_recommendations insert failed (missing)', e && e.stack ? e.stack : e);
            }
            return { ask, sessionId: persistSessionId };
          }

          if (selIdx < 0 || selIdx >= accessories.length) {
            const ask = `Mẫu ${selIdx+1} không tồn tại, bạn thử chọn lại nhé.`;
            if (persistSessionId) {
              try {
                await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [persistSessionId, ask]);
                await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [persistSessionId]);
              } catch (e) { /* ignore */ }
            }
            return { ask, sessionId: persistSessionId };
          }

          const chosen = accessories[selIdx];
          const chosenVariant = String(chosen.variant_id || chosen.variant || chosen.id || '');
          const chosenName = chosen.name || chosen.product_name || chosen.title || chosenVariant;

          // persist user selection for analytics / reuse (always attempt, even without session)
          try {
            const ctx3 = { action: 'accessory_select', source: 'quick_reply', sessionId: persistSessionId };
            const items3 = { selected: { index: selIdx + 1, variant_id: chosenVariant, raw: chosen } };
            await client.query(
              `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
               VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
              [
                userId,
                ctx3,
                items3,
                'user-action'
              ]
            );
          } catch (e) {
            // Log full detail to help debug why insert didn't persist
            console.warn('[aiService.handleGeneralMessage] persist user selection to ai_recommendations failed', {
              err: e && (e.stack || e.message) ? (e.stack || e.message) : e,
              userId, chosenVariant, selIdx, persistSessionId
            });
          }

          const reply = `Đã chọn: ${chosenName}. Mình lưu lựa chọn của bạn. Bạn muốn mình show chi tiết (hình/size) hoặc tư vấn thêm phụ kiện khác?`;

          // persist assistant response into chat history when session available
          if (persistSessionId) {
            try {
              await client.query(
                `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
                 VALUES ($1, 'assistant', $2, $3::jsonb, NOW())`,
                [
                  persistSessionId,
                  reply,
                  { action: 'accessory_selected', selected: { index: selIdx + 1, variant_id: chosenVariant } }
                ]
              );
              await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [persistSessionId]);
            } catch (e) {
              console.error('[aiService.handleGeneralMessage] persist assistant selection reply failed', e && e.stack ? e.stack : e);
            }
          }

          return { reply, selected: { index: selIdx + 1, variant_id: chosenVariant, raw: chosen }, sessionId: persistSessionId };
        } catch (e) {
          console.error('[aiService.handleGeneralMessage] sample quick-reply handler failed', e && e.stack ? e.stack : e);
          // fallthrough to other handlers
        }
      }

      // Handle "Không thích cái nào" — gọi suggestAccessories loại trừ các variant đã hiển thị
      if (/\b(không thích cái nào|khong thich cai nao|không thích cái nào)\b/i.test(String(message || ''))) {
        try {
          // collect excluded ids for analytics (best-effort)
          const last = await exports.getLastRecommendationForUser(userId, 'accessories');
          let excludeIds = [];
          if (last && last.items) {
            let recJson = last.items;
            if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch(e){ recJson = null; } }
            const accessories = recJson && recJson.accessories ? recJson.accessories : [];
            excludeIds = accessories.map(a => String(a.variant_id || a.variant || a.id)).filter(Boolean);
          }

          // persist user action for analytics but DO NOT trigger new product generation here
          try {
            await client.query(
              `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
               VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
              [userId, JSON.stringify({ action: 'accessory_reject_all', sessionId }), JSON.stringify({ excluded: excludeIds }), 'user-action']
            );
          } catch (e) { /* non-fatal */ console.warn('[aiService.handleGeneralMessage] persist reject action failed', e && e.stack ? e.stack : e); }

          // Friendly assistant reply only — offer clarifying quick replies so FE can next-step without generating products
          const reply = 'Mình hiểu — bạn không thích những mẫu này rồi. Bạn muốn mình thử gợi ý theo màu, kiểu hay xem thêm mẫu khác?';
          const followUp = { quickReplies: ['Gợi ý thêm mẫu khác', 'Không cần'] };

          if (sessionId) {
            try {
              await client.query(
                `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
                 VALUES ($1,'assistant',$2,$3::jsonb,NOW())`,
                [sessionId, reply, JSON.stringify({ action: 'accessory_reject_ack', excluded: excludeIds, followUp })]
              );
              await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
            } catch (e) { /* non-fatal */ console.warn('[aiService.handleGeneralMessage] persist assistant ack failed', e && e.stack ? e.stack : e); }
          }

          return { reply, accessories: [], data: [], followUp, sessionId };
        } catch (e) {
          console.error('[aiService.handleGeneralMessage] handle "không thích cái nào" failed', e && e.stack ? e.stack : e);
        }
      }

      //2.1.2. Xử lý quickreply "Gợi ý thêm mẫu khác" / "không cần"
      const normTrim = String(message || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (/^(goi y them mau khac|gợi ý thêm mẫu khác)$/i.test(normTrim) || normTrim === 'gợi ý thêm mẫu khác' || normTrim === 'goi y them mau khac') {
        // persist user's quick-reply if not already saved (best-effort)
        if (sessionId && !_userMessagePersisted && message && String(message).trim()) {
          try {
            await client.query(
              `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'user', $2, NOW())`,
              [sessionId, String(message).trim()]
            );
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
            _userMessagePersisted = true;
          } catch (e) { /* non-fatal */ console.warn('[aiService] persist quick-reply user failed', e && e.stack ? e.stack : e); }
        }

        try {
          // 1) If lastAccessoryRec exists and was an accessories response, prefer suggesting more accessories
          try {
            if (lastAccessoryRec && lastAccessoryRec.items) {
              let json = lastAccessoryRec.items;
              if (typeof json === 'string') { try { json = JSON.parse(json); } catch (_) { json = null; } }
              const accessories = json && json.accessories ? json.accessories : [];
              const excludeIds = accessories.map(a => String(a.variant_id || a.variant || a.id)).filter(Boolean);

              const accRes = await exports.suggestAccessories(userId, message || 'Gợi ý thêm mẫu khác', {
                sessionId,
                excludeVariantIds: excludeIds,
                _userMessagePersisted: _userMessagePersisted,
                max: 6
              });

              if (accRes && accRes.ask) return { ask: accRes.ask, sessionId };
              // ensure assistant reply persisted (suggestAccessories usually persists, but double-check best-effort)
              if (sessionId && accRes && accRes.reply) {
                try {
                  await client.query(
                    `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
                     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
                    [sessionId, 'assistant', accRes.reply, JSON.stringify({ type: 'accessories', items: accRes.accessories || [], followUp: accRes.followUp || null })]
                  );
                  await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
                } catch (_) { /* ignore duplicate persist errors */ }
              }
              return { reply: accRes.reply || 'Mình gợi ý thêm vài mẫu cho bạn nè.', accessories: accRes.accessories || [], data: accRes.accessories || [], followUp: accRes.followUp || null, sessionId };
            }
          } catch (ee) {
            console.warn('[aiService.handleGeneralMessage] accessory-continue attempt failed', ee && ee.stack ? ee.stack : ee);
          }

          // 2) Otherwise prefer outfit continuation (keep prior behavior)
          if (lastRec && lastRec.items) {
            let recJson = lastRec.items;
            if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch (_) { recJson = null; } }
            const outfits = recJson && recJson.outfits ? recJson.outfits : [];
            if (outfits && outfits.length > 0) {
              const excludeIds = [];
              for (const o of outfits) if (Array.isArray(o.items)) excludeIds.push(...o.items.map(i => String(i)));

              let occasionFromContext = null, weatherFromContext = null;
              try {
                const ctx = typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context;
                occasionFromContext = ctx?.occasion || null;
                weatherFromContext = ctx?.weather || null;
              } catch (e) { /* ignore */ }

              const rec = await exports.generateOutfitRecommendation(userId, occasionFromContext, weatherFromContext, {
                sessionId,
                maxOutfits: 1,
                excludeVariantIds: excludeIds,
                more: true
              });
              if (rec && rec.ask) return { ask: rec.ask, sessionId };
              // persist reply if needed
              if (sessionId && rec && rec.reply && !rec._persistedByGenerator) {
                try {
                  await client.query(
                    `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) VALUES ($1,'assistant',$2,$3::jsonb,NOW())`,
                    [sessionId, rec.reply, JSON.stringify({ outfits: rec.outfits || [], followUp: rec.followUp || null })]
                  );
                  await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
                } catch (_) { /* non-fatal */ }
              }
              return { reply: rec.reply || 'Mình gợi ý thêm 1 set cho bạn.', outfits: rec.outfits || [], followUp: rec.followUp || null, sessionId };
            }
          }

          // 3) Final fallback: try outfit generator (safe UX)
          const recFallback = await exports.generateOutfitRecommendation(userId, null, null, {
            sessionId,
            maxOutfits: 1,
            more: true
          });
          if (recFallback && recFallback.ask) return { ask: recFallback.ask, sessionId };
          return { reply: recFallback.reply || 'Mình gợi ý thêm 1 set cho bạn.', outfits: recFallback.outfits || [], followUp: recFallback.followUp || null, sessionId };

        } catch (e) {
          console.error('[aiService.handleGeneralMessage] quickReply "Gợi ý thêm mẫu khác" critical error', e && e.stack ? e.stack : e);
          // return friendly message instead of throwing (prevents frontend "Lỗi kết nối")
          return { reply: 'Lỗi khi lấy mẫu mới, bạn thử lại sau vài giây nha!', accessories: [], data: [], sessionId };
        }
      }

      if (/^(khong can|không cần|khong canh?)$/i.test(normTrim) || normTrim === 'không cần') {
        const reply = 'Oke bạn, không cần thì thôi nha! Nếu cần mình luôn sẵn sàng nhé 😊';
        try {
          if (sessionId) {
            await client.query(
              `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`,
              [sessionId, reply]
            );
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
          }
        } catch (e) { /* non-fatal */ }
        return { reply, sessionId };
      }

      //2.2. Xử lý phụ kiện followUp "nam", "nữ", "cả hai"
      const _normQuick = String(message || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      if (sessionId && /^(nam|nu|ca hai|ca-hai|ca_hai|ca)$/.test(_normQuick)) {
        // persist user's quick-reply only if we haven't already
        if (!_userMessagePersisted) {
          try {
            await client.query(
              `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'user', $2, NOW())`,
              [sessionId, String(message).trim()]
            );
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
            _userMessagePersisted = true;
          } catch (e) {
            console.warn('[aiService.handleGeneralMessage] persist gender quick-reply failed', e && e.stack ? e.stack : e);
          }
        }

        // check recent assistant messages for an accessories.ask_gender probe
        try {
          const aQ = await client.query(
            `SELECT id, content, metadata, created_at
             FROM ai_chat_messages
             WHERE session_id = $1 AND role = 'assistant' AND metadata IS NOT NULL
             ORDER BY created_at DESC LIMIT 10`,
            [sessionId]
          );
          // find the most recent assistant ask for accessories/gender and capture its timestamp
          let askRow = null;
          for (const r of (aQ.rows || [])) {
            try {
              const meta = (typeof r.metadata === 'string') ? JSON.parse(r.metadata) : r.metadata;
              if (meta && (meta.type === 'accessories.ask_gender' || meta.type === 'accessories.ask')) { askRow = r; break; }
            } catch (_) { /* ignore parse errors */ }
          }

          if (askRow) {
            // map quick-reply -> context.gender
            let genderVal = null;
            if (_normQuick === 'nam') genderVal = 'nam';
            else if (_normQuick === 'nu') genderVal = 'nữ';
            else genderVal = null; // 'ca hai' => no gender filter

            // Try to recover the original user query that triggered the assistant ask (user message before the ask)
            let originalUserQuery = null;
            try {
              const uQ = await client.query(
                `SELECT content FROM ai_chat_messages
                 WHERE session_id = $1 AND role = 'user' AND created_at < $2
                 ORDER BY created_at DESC LIMIT 1`,
                [sessionId, askRow.created_at]
              );
              if (uQ.rowCount) originalUserQuery = uQ.rows[0].content;
            } catch (ux) { /* ignore */ }

            // prefer originalUserQuery when available so suggestAccessories knows requestedType (túi/vi/kinh)
            const queryToUse = originalUserQuery && String(originalUserQuery).trim().length ? String(originalUserQuery) : message;

            const accRes = await exports.suggestAccessories(userId, queryToUse, {
              sessionId,
              context: { gender: genderVal },
              _userMessagePersisted: true,
              max: opts?.max || 6
            });

            if (accRes) {
              if (accRes.ask) return { ask: accRes.ask, sessionId };
              return { reply: accRes.reply, accessories: accRes.accessories || [], data: accRes.accessories || [], followUp: accRes.followUp || null, sessionId };
            }
          }
        } catch (e) {
          console.error('[aiService.handleGeneralMessage] handle gender quick-reply failed', e && e.stack ? e.stack : e);
        }
      }

      //2.3. Xử lý quickreply "Oke luôn"
      if (/\boke\s*luôn\b/i.test(lowerMsg)) {
        const ask = 'Bạn cho mình biết chiều cao và cân nặng (cm/kg) để mình tư vấn size chính xác nhé?';
        try {
          if (sessionId) await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, ask]);
        } catch (e) { console.error('[aiService.handleGeneralMessage] persist ask failed', e && e.stack ? e.stack : e); }
        return { ask, sessionId };
      }

      if (/\b(để\s*sau|để\s*sau\s*nha|de\s*sau)\b/i.test(lowerMsg)) {
        const reply = 'Oke bạn, để sau nha! 😊';
        try {
          if (sessionId) {
            await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, reply]);
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
          }
        } catch (e) { console.error('[aiService.handleGeneralMessage] persist quick-reply failed', e && e.stack ? e.stack : e); }
        return { reply, sessionId };
      }

      // 3) End conversation quick reply
      if (/\bđủ\s*rồi\b/i.test(lowerMsg) || isGratitude(lowerMsg)){
        const reply = 'Oke bạn, mình luôn sẵn sàng khi bạn cần nhé! 😊';
        if (sessionId) {
          await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, reply]);
          await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
        }
        return { reply, sessionId };
      }
    } catch (e) {
      console.error('[aiService.handleGeneralMessage] quickReplies handler error', e && e.stack ? e.stack : e);
      // fallthrough to normal processing
    }

    // if slotHints indicates accessories intent, prefer accessory path BEFORE calling outfit generator
    if (slotHints.wantsAccessories) {
      console.debug('[aiService.handleGeneralMessage] slotHints indicates wantsAccessories, delegating to suggestAccessories', { message: String(message).slice(0,200) });
      if (process.env.DEBUG_AI_SERVICE) console.debug('[aiService.handleGeneralMessage.DEBUG] accessory branch triggered by slotHints');
      const accResult = await exports.suggestAccessories(userId, message, {
        sessionId,
        categoryIds: inferAccessorySlugsFromMessage(message),
        max: 6,
        _userMessagePersisted
      });

      if (process.env.DEBUG_AI_SERVICE) {
        console.debug('[aiService.handleGeneralMessage.DEBUG] suggestAccessories result preview:', {
          reply: accResult && accResult.reply ? String(accResult.reply).slice(0,400) : null,
          accessoriesCount: Array.isArray(accResult?.accessories) ? accResult.accessories.length : 0,
          ask: accResult?.ask || false
        });
      }
      if (accResult.accessories?.length > 0) {
        return { reply: accResult.reply, accessories: accResult.accessories, followUp: accResult.followUp || null, sessionId };
      }
      return { reply: accResult.reply || 'Mình chưa thấy mẫu phụ kiện nào phù hợp, bạn muốn tìm kiểu gì ạ?', accessories: [], followUp: accResult.followUp || null, sessionId };
      }
      const accessorySlugs = inferAccessorySlugsFromMessage(message);
      if(accessorySlugs.length > 0) {
        console.debug('[AI] Accessory intent detected ', {message, slugs: accessorySlugs});

      const accResult = await exports.suggestAccessories(userId, message, {
          sessionId,
          categoryIds: accessorySlugs,
          max: 5,
          _userMessagePersisted: _userMessagePersisted
      });

      if(accResult.accessories?.length > 0){
         return{
          reply: accResult.reply,
          accessories: accResult.accessories,
          data: accResult.accessories,
          sessionId
        };
      }

      return {
        reply: accResult.reply || 'Mình chưa thấy mẫu phụ kiện nào phù hợp, bạn muốn tìm kiểu gì ạ?',
        accessories: [],
        data: [],
        sessionId
      };
    }

    // helper: resolve simple references ("áo đó", "outfit 2") -> variant id or null
    const resolveRefFromLastRecommendation = (lastRecLocal, msg) => {
        if (!lastRecLocal || !msg) return null;
        let recJson = lastRecLocal.items;
        if (typeof recJson === 'string') {
          try { recJson = JSON.parse(recJson); } catch (e) { recJson = null; }
        }
        const outfits = (recJson && recJson.outfits) ? recJson.outfits : [];

        // numeric index "outfit 2" or "bộ 1"
        const idxMatch = String(msg).match(/(?:bộ|outfit|thứ)\s*(\d+)/i);
        if (idxMatch) {
          const n = Number(idxMatch[1]);
          if (!Number.isNaN(n) && outfits[n - 1]) {
            return Array.isArray(outfits[n - 1].items) && outfits[n - 1].items[0] ? outfits[n - 1].items[0] : null;
          }
        }

        const txt = String(msg || '').toLowerCase();
        const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const wantTop = /\b(áo|cái áo|chiếc áo|top|shirt|blouse|sơ mi|áo len|áo khoác|áo thun|đầm|dress)\b/i.test(txt) || /\bao\b/i.test(txt);
        const wantBottom = /\b(quần|pants|jean|short|skirt|váy|kaki|trousers|chino)\b/i.test(txt);

        const pickFromMeta = (o, matchTop, matchBottom) => {
          if (!o || !Array.isArray(o.items)) return null;
          const meta = Array.isArray(o.meta) ? o.meta : null;
          if (meta && meta.length === o.items.length) {
            for (let i = 0; i < meta.length; i++) {
              const m = meta[i] || {};
              const pname = _norm(m.product_name || '');
              const cat = _norm(m.category_name || '');
              if (matchTop && (pname.includes('ao') || /top|shirt|blouse|dress/.test(cat))) return o.items[i];
              if (matchBottom && (pname.includes('quan') || /quan|pants|jean|skirt|trousers/.test(cat))) return o.items[i];
            }
          }
          const name = String(o.name || '').toLowerCase();
          const desc = String(o.description || '').toLowerCase();
          if (matchTop && (name.includes('áo') || desc.includes('áo'))) return o.items[0];
          if (matchBottom && (name.includes('quần') || desc.includes('quần'))) return o.items[0];
          return null;
        };

        for (const o of outfits) {
          if (wantTop) {
            const v = pickFromMeta(o, true, false);
            if (v) return v;
          }
          if (wantBottom) {
            const v = pickFromMeta(o, false, true);
            if (v) return v;
          }
        }

        if (outfits.length === 1 && Array.isArray(outfits[0].items) && outfits[0].items[0]) return outfits[0].items[0];
        return null;
      };

    //const lowerMsg = String(message || '').toLowerCase();
    const stockIntentRe = /\b(có\s+size|còn\s+size|còn\s+hàng|còn\s+không|còn\s+size\s*[a-z0-9]|có\s+hàng)\b/i;
    const recommendIntentRe = /\b(tư vấn|gợi ý|chọn\s*size|giúp\s*mình|muốn|gợi ý\s*1|muốn\s*(?:1|một)?\s*(?:bộ|outfit|set|bộ\s*trang\s*phục|bộ\s*đồ)|bộ|outfit|set|mix\s*đồ|phối\s*đồ|basic|đơn giản|văn\s+phòng|công\s+sở)\b/i;
    const quickSuggestKeywords = /\b(basic|đơn giản|văn phòng|công sở|office|phối đồ|mix đồ|bộ trang phục|cho mình 1 bộ|cho mình một bộ)\b/i;
    //const slotHints = (typeof extractSlotsFromMessage === 'function') ? extractSlotsFromMessage(message || '') : {};

    // follow-up intents
    const showMoreIntent = /\b(xem thêm|thêm (?:1|một)? (?:outfit|bộ|set)|thêm giúp|thêm nữa|mình muốn (?:1|một)? (?:outfit|bộ) khác|muốn (?:1|một)? (?:outfit|bộ) khác|outfit khác|bộ khác)? (?:có)\b/i;
    const colorIntent = /\b(màu|màu gì|màu nào)\b/i;
    const sizeIntent = /\b(size|cỡ|kích cỡ|chiều cao|cân nặng|tư vấn size)\b/i;
    const sizeIntentRe = sizeIntent;
    const colorIntentRe = colorIntent;
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
        } catch (e) { /* ignore */ }
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
        if (rec && rec.outfits && rec.outfits.length) return { reply: rec.reply || rec.message || 'Mình gợi ý thêm 1 set cho bạn.', outfits: rec.outfits, followUp: rec.followUp || null, sessionId };
        return { reply: 'Mình chưa tìm được set khác, bạn muốn thử phong cách khác không?', outfits: [], followUp: null, sessionId };
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] showMore flow failed', e && e.stack ? e.stack : e);
        return { reply: 'Mình không tìm được set mới ngay bây giờ, thử lại sau nhé!', outfits: [], followUp: null, sessionId };
      }
    }

    // 1.5) change/dislike item intent (keep/replace specific item in last outfit)
    const changeIntent = /\b(thay\s*đổi|đổi|không\s*thích|ko\s*thích|không\s*ưa|không\s*hợp|không thích mẫu|đổi cái)\b/i;
    if (changeIntent.test(lowerMsg)) {
      if (!lastRec) return { ask: 'Bạn đang nói tới bộ outfit trước đó phải không? Mình cần biết bộ nào để đổi giúp bạn nhé.', sessionId };
      const targetVariant = resolveRefFromLastRecommendation(lastRec, message);
      if (!targetVariant) return { ask: 'Bạn có thể nói rõ "cái áo đó" hoặc "outfit 2" để mình biết đổi món nào không?', sessionId };

      // find outfit that contains targetVariant (fallback to first outfit)
      let recJson = lastRec.items;
      if (typeof recJson === 'string') { try { recJson = JSON.parse(recJson); } catch(e) { recJson = null; } }
      const outfits = recJson && recJson.outfits ? recJson.outfits : [];
      let outfit = outfits.find(o => Array.isArray(o.items) && o.items.includes(targetVariant));
      if (!outfit && outfits.length === 1) outfit = outfits[0];

      const keepIds = Array.isArray(outfit?.items) ? outfit.items.filter(i => String(i) !== String(targetVariant)) : [];
      const removeIds = [String(targetVariant)];

      // reuse context if available
      let occasionFromContext = null, weatherFromContext = null;
      if (lastRec && lastRec.context) {
        try {
          const ctx = typeof lastRec.context === 'string' ? JSON.parse(lastRec.context) : lastRec.context;
          occasionFromContext = ctx && ctx.occasion ? ctx.occasion : null;
          weatherFromContext = ctx && ctx.weather ? ctx.weather : null;
        } catch (e) { /* ignore */ }
      }

      try {
        const rec = await exports.generateOutfitRecommendation(
          userId,
          occasionFromContext,
          weatherFromContext,
          {
            sessionId: sessionId,
            // message intentionally omitted to force reuse of stored context
            maxOutfits: 1,
            excludeVariantIds: removeIds,
            keepVariantIds: keepIds,
            more: true
          }
        );
        if (!rec) return { reply: 'Mình chưa tìm được món thay thế ngay, thử lại nhé!', sessionId };
        if (rec.ask) return { ask: rec.ask, sessionId };
        return { reply: rec.reply || rec.message || 'Mình gợi ý 1 set khác cho bạn.', outfits: rec.outfits || [], followUp: rec.followUp || null, sessionId };
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] change-item flow failed', e && e.stack ? e.stack : e);
        return { reply: 'Mình không tìm được món thay thế ngay giờ, thử lại sau nhé!', sessionId };
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
          // If reference not resolved yet, try to infer variant from last recommendation metadata or recent assistant messages
          if (!refVariant) {
            // helper: normalize tokens
            const normalize = (s='') => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const tokens = normalize(message).split(/\s+/).filter(Boolean);
            // try lastRec metadata first
            if (lastRec && lastRec.items) {
              try {
                let recJson = lastRec.items;
                if (typeof recJson === 'string') recJson = JSON.parse(recJson);
                const outfits = (recJson && recJson.outfits) ? recJson.outfits : [];
                for (const o of outfits) {
                  const metaArr = Array.isArray(o.meta) ? o.meta : [];
                  for (const m of metaArr) {
                    const pname = String(m.product_name || '').toLowerCase();
                    const pcat = String(m.category_name || '').toLowerCase();
                    for (const t of tokens) {
                      if (!t) continue;
                      if ((pname && pname.includes(t)) || (pcat && pcat.includes(t))) {
                        if (m.variant_id) { refVariant = String(m.variant_id); break; }
                      }
                    }
                    if (refVariant) break;
                  }
                  if (refVariant) break;
                }
              } catch (eMeta) { /* ignore parse errors */ }
            }

            // fallback: inspect recent assistant messages' metadata (if still no match)
            if (!refVariant && sessionId) {
              try {
                const aQ = await client.query(`SELECT metadata, content FROM ai_chat_messages WHERE session_id = $1 AND role = 'assistant' AND metadata IS NOT NULL ORDER BY created_at DESC LIMIT 10`, [sessionId]);
                for (const row of (aQ.rows || [])) {
                  try {
                    const meta = (typeof row.metadata === 'string') ? JSON.parse(row.metadata) : row.metadata;
                    if (!meta) continue;
                    // meta may contain outfits -> meta.outfits[].meta[].variant_id or saved outfit/items
                    const outfits = meta.outfits || (meta.outfit ? [meta.outfit] : null);
                    if (Array.isArray(outfits)) {
                      for (const o of outfits) {
                        const metaArr = Array.isArray(o.meta) ? o.meta : [];
                        for (const m of metaArr) {
                          const pname = String(m.product_name || '').toLowerCase();
                          const pcat = String(m.category_name || '').toLowerCase();
                          for (const t of tokens) {
                            if (!t) continue;
                            if ((pname && pname.includes(t)) || (pcat && pcat.includes(t))) {
                              if (m.variant_id) { refVariant = String(m.variant_id); break; }
                            }
                          }
                          if (refVariant) break;
                        }
                        if (refVariant) break;
                      }
                    }
                    if (refVariant) break;
                  } catch (ex) { /* ignore row parse errors */ }
                }
              } catch (eRows) { /* ignore DB fetch errors */ }
            }
          }

          if (!refVariant) {
            // final user-friendly ask when we still can't infer the reference
            return { ask: 'Bạn đang nói tới món đồ nào trong gợi ý trước đó? Bạn có thể nói "cái quần baggy đó" hoặc "outfit 1" để mình kiểm tra màu giúp nhé.', sessionId };
          }
          // primary: get colors for the product (via helper)
          let variants = [];
          try {
            variants = await getVariantColorsByVariant(refVariant);
          } catch (eInner) {
            console.error('[aiService.handleGeneralMessage] getVariantColorsByVariant failed', eInner && eInner.stack ? eInner.stack : eInner);
            variants = [];
          }

          // defensive fallback: query product_variants by product_id if helper returned empty
          if ((!variants || variants.length === 0)) {
            try {
              const info = await checkVariantAvailability(refVariant);
              if (info && info.product_id) {
                const vQ = await client.query(
                  `SELECT id AS variant_id, color_name, sizes, stock_qty
                   FROM product_variants
                   WHERE product_id = $1
                   ORDER BY color_name NULLS LAST, sizes NULLS LAST`,
                  [info.product_id]
                );
                variants = (vQ.rows || []).map(r => ({
                  variant_id: String(r.variant_id),
                  product_id: info.product_id || null,
                  color_name: r.color_name || null,
                  size_name: r.sizes || null,
                  stock_qty: (typeof r.stock_qty === 'number') ? r.stock_qty : null,
                  available: (typeof r.stock_qty === 'number') ? (r.stock_qty > 0) : null
                }));
              }
            } catch (eFallback) {
              console.error('[aiService.handleGeneralMessage] fallback fetch variant colors failed', eFallback && eFallback.stack ? eFallback.stack : eFallback);
            }
          }

          if (!variants || variants.length === 0) {
            return { reply: 'Mình không tìm thấy màu cho sản phẩm này.', sessionId };
          }

          // build color list and product name
          const info = await checkVariantAvailability(refVariant).catch(()=>null);
          const productName = info && info.product_name ? info.product_name : (variants[0].product_name || variants[0].product_id ? `Sản phẩm` : 'Sản phẩm này');

          // distinct color strings with availability tag
          // Return only distinct color names (no availability text)
          const colors = variants.map(v => (v.color_name || v.color || '').toString().trim());
          // remove empty / unknown placeholders and dedupe
          const unique = Array.from(new Set(colors)).filter(c => c && c.toLowerCase() !== 'không rõ');

          if (unique.length === 0) {
            return { reply: 'Mình không tìm thấy màu cho sản phẩm này.', sessionId };
          }
          return { reply: `${productName} có các màu: ${unique.join(', ')}.`, sessionId };
        } catch (e) {
          console.error('[aiService.handleGeneralMessage] colorIntent final error', e && e.stack ? e.stack : e);
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

    // PRIORITY: nếu user hỏi "thông tin / xem chi tiết" => trả chi tiết món trước, KHÔNG gọi generator
    const itemDetailIntent = /\b(thông tin chi tiết|thông tin|chi tiết|xem chi tiết|cho mình thông tin|cho mình xem chi tiết|cho mình thông tin của|chi tiết của)\b/i;
    if (itemDetailIntent.test(lowerMsg)) {
      try {
        const itemRes = await exports.retrieveLastItemDetails(userId, sessionId, message);
        if (itemRes) {
          if (itemRes.ask) return { ask: itemRes.ask, sessionId };
          return { reply: itemRes.reply, item: itemRes.item, sessionId };
        }
        // if retrieve didn't return useful data, fall through to normal flow
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] retrieveLastItemDetails failed', e && e.stack ? e.stack : e);
        // fallthrough to recommendation flow
      }
    }

    // thì xử lý branch phụ kiện NGAY lập tức (không gọi generator outfit).
    const accessoryRequestForExistingOutfitRe = /\b(tư vấn thêm phụ kiện|tư vấn phụ kiện|thêm phụ kiện|chọn thêm phụ kiện|phụ kiện cho (?:outfit|bộ)|phụ kiện cho bộ|cho outfit này|cho bộ này|bộ vừa rồi|outfit vừa rồi)\b/i;
    if (accessoryRequestForExistingOutfitRe.test(String(message || '')) || slotHints.wantsAccessories) {
       if (process.env.DEBUG_AI_SERVICE) console.debug('[aiService.handleGeneralMessage.DEBUG] accessoryRequestForExistingOutfitRe matched:', String(message).slice(0,200));
      try {
        // suggestAccessories đã có logic lấy last recommendation khi detect cụm "outfit này" bên trong nó;
        // truyền _userMessagePersisted để tránh double-persist nếu cần.
        const accRes = await exports.suggestAccessories(userId, message, {
          sessionId,
          _userMessagePersisted
        });

        if (process.env.DEBUG_AI_SERVICE) console.debug('[aiService.handleGeneralMessage.DEBUG] suggestAccessories (outfit branch) returned', {
          reply: accRes && accRes.reply ? String(accRes.reply).slice(0,400) : null,
          accessoriesCount: Array.isArray(accRes?.accessories) ? accRes.accessories.length : 0,
          ask: !!accRes?.ask
        });
        if (accRes) {
          if (accRes.ask) return { ask: accRes.ask, sessionId };
          if (Array.isArray(accRes.accessories) && accRes.accessories.length > 0) {
            return { reply: accRes.reply, accessories: accRes.accessories, data: accRes.accessories, followUp: accRes.followUp || null, sessionId };
          }
          // nếu không có accessories nhưng suggestAccessories trả reply/ask thì trả luôn (data empty)
          if (accRes.reply) return { reply: accRes.reply, accessories: accRes.accessories || [], data: accRes.accessories || [], sessionId };
        }
        // nếu suggestAccessories không tìm được gì, fallthrough để có thể gọi generator nếu cần
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] accessory-priority branch failed', e && e.stack ? e.stack : e);
        // tiếp tục flow bình thường
      }
    }

    // If user asked for new recommendation (original flow)
    if (recommendIntentRe.test(lowerMsg) || quickSuggestKeywords.test(lowerMsg) || slotHints.occasion || slotHints.style || (slotHints.productHints && slotHints.productHints.length)) {
      try {
        const rec = await exports.generateOutfitRecommendation(userId, null, null, {
          sessionId,
          message,
          maxOutfits: opts?.maxOutfits || 3,
          _userMessagePersisted, // inform generator that we've already saved the user message
          inferredWantsAccessories: slotHints.wantsAccessories || false
        });

        if (!rec) {
          console.error('[aiService.handleGeneralMessage] generateOutfitRecommendation returned empty');
          return { reply: 'Mình đang tạm thời không thể gợi ý được. Thử lại sau nhé!', outfits: [], sessionId };
        }

        if (rec.ask) {
          const askText = rec.ask;
          if (sessionId) {
            try {
              if(rec.outfits || rec.followUp){
                await client.query(
                  `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) VALUES ($1,'assistant',$2,$3::jsonb,NOW())`,
                  [sessionId, askText, JSON.stringify({ outfits: rec.outfits || [], followUp: rec.followUp || null })]
                );
              } else {
                await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, askText]);
              }
              await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
            } catch (e) {
              console.error('[aiService.handleGeneralMessage] persist ask failed', e && e.stack ? e.stack : e);
            }
          }
          return { ask: askText, outfits: Array.isArray(rec.outfits) ? rec.outfits : [], sessionId };
        }

        const outfitsArr = Array.isArray(rec.outfits) ? rec.outfits : [];
        const replyText = rec.reply || rec.message || (outfitsArr.length ? `Mình đã gợi ý ${outfitsArr.length} set cho bạn.` : 'Mình chưa tìm được set phù hợp, bạn muốn mình thử phong cách khác không?');

        if (sessionId && replyText && !rec._persistedByGenerator) {
          try {
            // Nếu generator không tự lưu, persist reply và kèm metadata khi có followUp/outfits
            if (rec && (rec.followUp || (Array.isArray(outfitsArr) && outfitsArr.length))) {
              await client.query(
                `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) VALUES ($1,'assistant',$2,$3::jsonb,NOW())`,
                [sessionId, replyText, JSON.stringify({ outfits: outfitsArr, followUp: rec.followUp || null })]
              );
            } else {
              await client.query(`INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1,'assistant',$2,NOW())`, [sessionId, replyText]);
            }
            await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
          } catch (e) {
            console.error('[aiService.handleGeneralMessage] persist reply failed', e && e.stack ? e.stack : e);
          }
        }

        return { reply: replyText, outfits: outfitsArr, followUp: rec.followUp || null, sessionId };
      } catch (e) {
        console.error('[aiService.handleGeneralMessage] delegate to generateOutfitRecommendation failed', e && e.stack ? e.stack : e);
      }
    }

    // Replace/adjust follow-up handling for stock/size/color intents
    // (insert into the place that handles resolvedRef and size/stock/color intents)
    {
      // e.g. const targetVariantId = resolveRefFromLastRecommendation(lastRec, message) || variantHintFromMsg;
      const targetVariantId = (typeof resolveRefFromLastRecommendation === 'function') ? resolveRefFromLastRecommendation(lastRec, message) : null;
      if (targetVariantId) {
        // Handle "size / availability" question
        if (sizeIntentRe.test(lowerMsg) || /\b(size|size|cỡ|M|L|XL|S)\b/i.test(message)) {
          const info = await checkVariantAvailability(targetVariantId);
          if (!info) return { reply: 'Mình không tìm thấy sản phẩm đó nữa.' };
          // only respond with product name + availability for requested size (no numeric stock)
          const sizeRequestedMatch = message.match(/\b(size|size|cỡ|M|L|XL|S)\b/i);
          const sizeLabel = sizeRequestedMatch ? sizeRequestedMatch[0] : info.size;
          const availabilityText = info.available ? 'còn hàng' : 'hết hàng';
          const reply = `${info.product_name || 'Sản phẩm'} — size ${sizeLabel}: ${availabilityText}.`;
          // optionally persist assistant message, return structured minimal data (no counts)
          return { reply, selected: { product_id: info.product_id, variant_id: info.variant_id } };
        }

        // Handle "color preference / list colors" user utterance
        if (colorIntentRe.test(lowerMsg) || /màu|color|đỏ|đen|xanh|kem|trắng/i.test(message)) {
          // list COLORS only for same product_id
          const colors = await getVariantColorsByVariant(targetVariantId);
          if (!colors || colors.length === 0) return { reply: 'Mình không tìm thấy màu nào cho sản phẩm đó.' };
          // Build human-friendly list: "Đen (còn hàng), Kem (hết hàng)."
          const parts = [];
          const productName = (await (async () => {
            const c = await checkVariantAvailability(targetVariantId);
            return c ? c.product_name : null;
          })()) || 'Sản phẩm';
          for (const c of colors) {
            parts.push(`${c.color}${c.available ? ' (còn hàng)' : ' (hết hàng)'}`);
          }
          const reply = `Sản phẩm ${productName} có các màu: ${parts.join(', ')}.`;
          return { reply, selected: { product_id: colors[0].product_id || null } };
        }
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

// ---  helper: normalize items to prefer Top+Bottom, avoid same-category duplicates ---
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

const checkVariantAvailability = async (variantId) => {
  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT pv.id AS variant_id, pv.product_id, pv.sku, pv.color_name, pv.sizes, pv.stock_qty, p.name as product_name
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       WHERE pv.id = $1 LIMIT 1`,
      [variantId]
    );
    if (!q.rowCount) return null;
    const r = q.rows[0];
    return {
      variant_id: String(r.variant_id),
      product_id: r.product_id ? String(r.product_id) : null,
      product_name: r.product_name || null,
      color: r.color_name || null,
      color_name: r.color_name || null,    // compatibility
      size: r.sizes || null,
      stock_qty: typeof r.stock_qty === 'number' ? r.stock_qty : null, // compatibility
      available: (typeof r.stock_qty === 'number' && r.stock_qty > 0) ? true : false,
      _stock_qty_internal: r.stock_qty
    };
  } finally {
    client.release();
  }
};

const getVariantColorsByVariant = async (variantId) => {
  const client = await pool.connect();
  try {
    // defensive: find product_id for the variant
    const vq = await client.query(
      `SELECT product_id FROM product_variants WHERE id = $1 LIMIT 1`,
      [variantId]
    );
    if (!vq.rowCount) return [];
    const productId = vq.rows[0].product_id;
    const q = await client.query(
      `SELECT id AS variant_id, color_name, sizes, stock_qty, product_id
       FROM product_variants
       WHERE product_id = $1
       ORDER BY color_name NULLS LAST, sizes NULLS LAST`,
      [productId]
    );
    return q.rows.map(r => ({
      variant_id: String(r.variant_id),
      product_id: r.product_id ? String(r.product_id) : null,
      color: r.color_name || null,
      color_name: r.color_name || null, // compatibility with older callers
      size: r.sizes || null,
      stock_qty: typeof r.stock_qty === 'number' ? r.stock_qty : null, // compatibility
      available: (typeof r.stock_qty === 'number' && r.stock_qty > 0) ? true : false,
      _stock_qty_internal: r.stock_qty
    }));
  } finally {
    client.release();
  }
};

/**
 * Từ tin nhắn người dùng → suy ra các slug cần tìm phụ kiện
 * Hỗ trợ:
 * - Slug phân cấp (tui-xach-nu/tui-xach)
 * - Slug trùng (nhiều cate cùng slug 'tui-xach')
 * - Không dấu, có dấu, tiếng Anh, lỗi chính tả nhẹ
 */
// 1. Hàm infer – chỉ trả đúng slug có trong DB (không thêm fallback thừa)
function inferAccessorySlugsFromMessage(message = '') {
  const m = String(message)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const slugs = new Set(); // dùng Set để tránh trùng lặp

  // TÚI XÁCH NỮ
  if (/\b(tui|túi|xach|xách|bag|handbag|tote|shoulder|clutch)\b/.test(m)) {
    slugs.add('tui-xach-nu/tui-xach');
    if (/\b(đeo cheo|crossbody|deo cheo)\b/.test(m)) {
      slugs.add('tui-xach-nu/tui-deo-cheo');
    }
  }

  // VÍ
  if (/\b(vi|ví|bóp|wallet|purse)\b/.test(m)) {
    slugs.add('phu-kien/vi-nam');
    slugs.add('phu-kien/vi-nu');
    if (/\b(nam|men|boy)\b/.test(m)) slugs.add('phu-kien/vi-nam');
    if (/\b(nữ|nu|girl|women)\b/.test(m)) slugs.add('phu-kien/vi-nu');
  }

  // KÍNH
  if (/\b(kinh|kính|glass|sunglass|eyewear|gong|rayban)\b/.test(m)) {
    slugs.add('phu-kien/kinh-mat');
    slugs.add('phu-kien/kinh-bao-ho');
    slugs.add('phu-kien/gong-kinh');
  }

  return Array.from(slugs);
}

function extractColor(text = '') {
  if (!text || typeof text !== 'string') return null;
  const s = text.toLowerCase();
  const colors = ['đen','trắng','xanh','xanh dương','xanh lá','đỏ','hồng','tím','vàng','kem','be','nâu','xám','ghi','orange','brown','black','white','red','blue','green','pink','purple','yellow','beige','navy','grey','gray'];
  for (const c of colors) {
    if (s.includes(c)) return c;
  }
  return null;
}

// Helper: simple gender extractor (returns 'nam' | 'nữ' | null)
function extractGender(text = '') {
  if (!text || typeof text !== 'string') return null;
  const s = text.toLowerCase();
  if (/\b(nam|men|male|boy)\b/.test(s)) return 'nam';
  if (/\b(nữ|nu|women|female|girl)\b/.test(s)) return 'nữ';
  return null;
}

const parseAccessoryQuery = (text) => {
  const normalize = (s='') => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const norm = normalize(text);

  const types = [];
  const map = {
    'tui': ['túi', 'tui', 'bag', 'handbag', 'tote', 'crossbody', 'đeo chéo', 'deo cheo', 'clutch'],
    'vi': ['ví', 'vi', 'bóp', 'bop', 'wallet', 'purse'],
    'kinh': ['kính', 'kinh', 'glass', 'sunglass', 'eyewear']
  };
  for (const [key, keywords] of Object.entries(map)) {
    const normalizedKeywords = (keywords || []).map(k => normalize(k));
    if (normalizedKeywords.some(k => norm.includes(k))) types.push(key);
  }
  // màu, giới tính giữ nguyên như cũ...
  return { types, color: extractColor(text), gender: extractGender(text) };
};

exports.suggestAccessories = async (userId, message, opts = {}) => {
  const sessionId = opts.sessionId || null;
  const client = await pool.connect();

  try {
    if (sessionId && !opts._userMessagePersisted && message && String(message).trim().length) {
      await client.query(
        `INSERT INTO ai_chat_messages (session_id, role, content, created_at)
         VALUES ($1, 'user', $2, NOW())`,
        [sessionId, String(message).trim()]
      );
      // keep caller informed that message was persisted
      opts._userMessagePersisted = true;
      await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
    }
  } catch (e) {
    console.warn('[suggestAccessories] non-fatal: failed to persist incoming user message', e && e.stack ? e.stack : e);
  }

  try {
    const lowerMsg = (message || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // 1. Parse thông minh hơn (dùng cả regex + từ điển)
    const parsed = parseAccessoryQuery(lowerMsg);
    const typeDisplayMap = { tui: 'túi', vi: 'ví', kinh: 'kính' };
    const requestedType = (parsed.types && parsed.types.length) ? parsed.types[0] : null;
    const displayType = requestedType ? (typeDisplayMap[requestedType] || requestedType) : null;

     // debug: surface parsed + inferred slugs
    if (process.env.DEBUG_AI_SERVICE) {
      try { console.debug('[suggestAccessories.DEBUG] parsed:', parsed); } catch(_) {}
    }

    // tighten: try map to real category slugs when we have a requestedType
    const inferredSlugs = inferAccessorySlugsFromMessage(message || '');
    if (requestedType && Array.isArray(inferredSlugs) && inferredSlugs.length) {
      // add an extra strict category filter (use c.slug equality OR name ILIKE) to avoid unrelated clothing rows
      // this will be injected into the WHERE params below (we push this to params when building SQL)
      // store on opts so later SQL builder can use it
      opts._inferredAccessorySlugs = inferredSlugs;
      if (process.env.DEBUG_AI_SERVICE) console.debug('[suggestAccessories.DEBUG] inferred accessory slugs:', inferredSlugs);
    }
    // 1.a Nếu user yêu cầu phụ kiện "cho outfit này / cho bộ vừa rồi / cho bộ trước",
    // thì ưu tiên dùng context của last recommendation để tìm phụ kiện tương thích.
    const accessoryForOutfitRe = /\b(outfit này|bộ này|bộ vừa|bộ vừa rồi|bộ trước|phụ kiện cho (?:outfit|bộ)|phụ kiện cho bộ|thêm phụ kiện cho bộ|tư vấn thêm phụ kiện)\b/i;
    if (accessoryForOutfitRe.test(String(message || ''))) {
      try {
        const last = await exports.getLastRecommendationForUser(userId);
        if (last && last.items) {
          let recJson = last.items;
          if (typeof recJson === 'string') {
            try { recJson = JSON.parse(recJson); } catch (e) { recJson = null; }
          }
          const outfitVariants = (recJson && recJson.outfits && recJson.outfits[0] && Array.isArray(recJson.outfits[0].items))
            ? recJson.outfits[0].items.map(String)
            : [];
          if (outfitVariants.length) {
            // lấy category_id của các variant trong outfit để ưu tiên query accessory cùng gam màu / cùng nhóm
            try {
              const metaQ = await client.query(
                `SELECT pv.id AS variant_id, p.category_id
                 FROM product_variants pv
                 JOIN products p ON pv.product_id = p.id
                 WHERE pv.id = ANY($1::uuid[])`,
                [outfitVariants]
              );
              const outfitCatIds = Array.from(new Set((metaQ.rows || []).map(r => r.category_id).filter(Boolean)));
              if (outfitCatIds.length) {
                opts._fromLastOutfit = true;
                opts._outfitCategoryIds = outfitCatIds;
              }
            } catch (e) { /* ignore */ }
          }
        }
      } catch (e) { /* ignore */ }
    }
    
    // 2. Lấy context từ session nếu có (gender, occasion)
    let gender = opts.context?.gender || null;
    if (!gender && userId) {
      const u = await client.query(`SELECT gender FROM users WHERE id = $1`, [userId]);
      gender = u.rows[0]?.gender || null;
    }

    // Nếu user yêu cầu "túi" hoặc "ví" nhưng không nói rõ nam/nữ và DB cũng không có gender,
    // hỏi lại thay vì tự mặc định (tránh tư vấn nhầm giới tính)
    if ((requestedType === 'vi' || requestedType === 'tui') && !parsed.gender && !gender) {
      const ask = `Bạn cần ${displayType || 'phụ kiện'} cho nam hay nữ để mình chọn phù hợp?`;
      const quickReplies = ['Nam', 'Nữ', 'Cả hai'];
      try {
        if (sessionId) {
          await client.query(
            `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
             VALUES ($1, 'assistant', $2, $3::jsonb, NOW())`,
            [sessionId, ask, JSON.stringify({ type: 'accessories.ask_gender', quickReplies })]
          );
          await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
        }
      } catch (e) {
        console.warn('[suggestAccessories] failed to persist gender clarification ask (non-fatal)', e && e.stack ? e.stack : e);
      }
      return { reply: ask, ask: true, quickReplies, accessories: [], data: [], followUp: { quickReplies } };
    }
    // 3. Nếu vẫn quá chung chung → hỏi lại (nhưng thông minh hơn)
    if (!parsed.types.length && !parsed.color && !parsed.gender && !gender && !opts.ignoreClarify) {
      const promptText = 'Bạn đang muốn tìm loại phụ kiện nào ạ? Túi xách, ví, kính mát hay gì khác không, mình sẵn lòng tìm giúp cho nè?';
      const quickReplies = ['Túi xách', 'Ví da', 'Kính mát', 'Xem tất cả'];
      // persist assistant ask so FE / history shows it
      try {
        if (sessionId) {
          await client.query(
            `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
             VALUES ($1, 'assistant', $2, $3::jsonb, NOW())`,
            [sessionId, promptText, JSON.stringify({ type: 'accessories.ask', quickReplies })]
          );
          await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
        }
      } catch (e) {
        console.warn('[suggestAccessories] failed to persist clarification ask (non-fatal)', e && e.stack ? e.stack : e);
      }
      return {
        reply: promptText,
        ask: true,
        quickReplies,
        accessories: [],
        data: []
      };
    }

    // 4. Build query cực mạnh + ưu tiên sản phẩm hot
    const where = ['p.status = $1', 'pv.stock_qty > 0'];
    const params = ['active'];
    let idx = 2;

    let sqlBoostFragment = '';
    let sqlBoostParams = [];

    // Loại phụ kiện
    if (parsed.types.length) {
      if (opts._inferredAccessorySlugs && Array.isArray(opts._inferredAccessorySlugs) && opts._inferredAccessorySlugs.length) {
      where.push(`(c.slug = ANY($${idx}::text[]) OR LOWER(c.name) ILIKE ANY($${idx}::text[]))`);
      params.push(opts._inferredAccessorySlugs);
      idx++;
      }
      const synonymMap = {
        'tui': ['tui','túi','bag','handbag','tote','clutch'],
        'vi': ['vi','ví','bóp','wallet'],
        'kinh': ['kinh','kính','sunglass','eyewear','glass'],
        'belt': ['belt','thắt lưng','thắt-lưng']
      };
      const primaryType = String(parsed.types[0] || '').toLowerCase();
      const tokens = (synonymMap[primaryType] || [primaryType]).map(s => String(s).toLowerCase());
      const patterns = Array.from(new Set(tokens.map(s => `%${s}%`)));

      // TIGHTENED WHERE: chỉ filter bằng name/Category/slug theo token của loại yêu cầu
      where.push(`(LOWER(p.name) ILIKE ANY($${idx}::text[]) OR LOWER(c.name) ILIKE ANY($${idx}::text[]) OR LOWER(c.slug) ILIKE ANY($${idx}::text[]))`);
      params.push(patterns);
      idx++;

      // Prepare an ORDER BY boost so matches that contain the exact keywords surface first.
      // We'll inject this fragment into the final ORDER BY below.
      // Use same patterns as an extra param so pg can use parameterized values.
      sqlBoostFragment = `((LOWER(p.name) ILIKE ANY($${idx}::text[]))::int + (LOWER(c.name) ILIKE ANY($${idx}::text[]))::int) DESC, `;
      sqlBoostParams.push(patterns);
      params.push(patterns); // push once so $idx aligns; also keep params array consistent
      idx++;
    }

    // Màu sắc
    if (parsed.color) {
      // use parameterized LIKE pattern to avoid SQL syntax issues / injection
      where.push(`(LOWER(pv.color_name) ILIKE $${idx} OR LOWER(p.name) ILIKE $${idx})`);
      params.push('%' + parsed.color + '%');
      idx++;
    }

    // Giới tính (nếu biết)
    if (gender || parsed.gender) {
      const g = (gender || parsed.gender).toLowerCase();
      if (g === 'nam') {
        where.push(`(LOWER(p.name) ~ 'nam|men|unisex' OR LOWER(c.name) ~ 'nam|men')`);
      }
      if (g === 'nữ') {
        where.push(`(LOWER(p.name) ~ 'nữ|nu|women|unisex|girl' OR LOWER(c.name) ~ 'nữ|women')`);
      }
    }

    if (Array.isArray(opts.excludeVariantIds) && opts.excludeVariantIds.length) {
      where.push(`pv.id != ALL($${idx}::uuid[])`);
      params.push(opts.excludeVariantIds);
      idx++;
    }

    let sql = `
      SELECT 
        pv.id::text AS variant_id,
        p.id::text AS product_id,
        p.name,
        p.description AS description,
        pv.color_name AS color,
        COALESCE(p.final_price, p.price) AS price,
        COALESCE(
          (SELECT url FROM product_images WHERE variant_id = pv.id ORDER BY position LIMIT 1),
          (SELECT url FROM product_images WHERE product_id = p.id ORDER BY position LIMIT 1)
        ) AS image_url,
        pv.stock_qty,
        pv.sold_qty AS sold_qty,
        p.created_at,
        p.category_id,
        c.name AS category_name
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    `;

    // Inject boost fragment (if any) into ORDER BY to prefer direct matches, then secondary sort by sold/newest.
    const baseOrder = Array.isArray(opts._outfitCategoryIds) && opts._outfitCategoryIds.length
      ? ` (p.category_id = ANY($${idx}::uuid[])) DESC, pv.sold_qty DESC NULLS LAST, p.created_at DESC`
      : ` pv.sold_qty DESC NULLS LAST, p.created_at DESC`;

    if (Array.isArray(opts._outfitCategoryIds) && opts._outfitCategoryIds.length) {
      params.push(opts._outfitCategoryIds);
      idx++;
    }

    sql += ` ORDER BY ${sqlBoostFragment || ''}${baseOrder} LIMIT 48`;

    let res = await client.query(sql, params);
    console.debug('[suggestAccessories] primary query sample keys:', res.rows[0] ? Object.keys(res.rows[0]) : 'no rows');
    if (res.rows.length === 0) {
      console.debug('[suggestAccessories] primary query returned 0 rows', { sql: String(sql).slice(0,1000), params });

      // Fallback: if category slugs / ids were provided in opts, try resolving categories and query by category tree
      if (Array.isArray(opts.categoryIds) && opts.categoryIds.length) {
        try {
          const slugPatterns = opts.categoryIds.map(s => `%${String(s).toLowerCase()}%`);
          const catQ = await client.query(
            `SELECT id FROM categories WHERE slug = ANY($1::text[]) OR LOWER(name) ILIKE ANY($2::text[])`,
            [opts.categoryIds, slugPatterns]
          );
          if (catQ.rowCount > 0) {
            const catIds = catQ.rows.map(r => r.id);
            const altQ = await client.query(
              `SELECT 
                 pv.id::text AS variant_id,
                 p.id::text AS product_id,
                 p.name,
                 pv.color_name AS color,
                 COALESCE(p.final_price, p.price) AS price,
                 pi.url AS image_url,
                 pv.stock_qty,
                 pv.sold_qty AS sold_qty,
                 p.created_at,
               FROM product_variants pv
               JOIN products p ON p.id = pv.product_id
               LEFT JOIN product_images pi ON pi.variant_id = pv.id AND pi.position = 1
               WHERE p.status = 'active' AND pv.stock_qty > 0 AND p.category_id = ANY($1::uuid[])
               ORDER BY pv.sold_qty DESC NULLS LAST, p.created_at DESC
               LIMIT 12`,
              [catIds]
            );
            if (altQ.rows.length > 0) {
              res = altQ; // use fallback result set
              console.debug('[suggestAccessories] fallback by category returned rows', { count: res.rows.length });
            }
          }
        } catch (e) {
          console.warn('[suggestAccessories] fallback by category failed', e && e.stack ? e.stack : e);
        }
      }

      // still empty -> return friendly message
      if (!res || res.rows.length === 0) {
        return { reply: 'Hic, hiện tại shop hết mẫu bạn thích rồi ạ. Bạn muốn mình gợi ý màu/kiểu khác không?', accessories: [], data: [] };
      }
    }

    // 5. Trả về tối đa 6 mẫu đẹp nhất + reply ngắn gọn, dễ render
    // Prioritize actual accessories (avoid returning pants/áo when user asked "túi/xách")
    const accessoryRe = /\b(kính|kinh|túi|tui|ví|vi|phụ[ -]?kiện|phukien|clutch|wallet|bag|handbag|sunglass|jewelry|purse|shoulder|tote|crossbody)\b/i;
    const rows = res.rows || [];
    const accessoryRows = rows.filter(r => accessoryRe.test(((r.category_name || '') + ' ' + (r.name || '')).toLowerCase()));
    const nonAccessoryRows = rows.filter(r => !accessoryRe.test(((r.category_name || '') + ' ' + (r.name || '')).toLowerCase()));

    const preferredKeywordsByType = {
      vi: ['vi','ví','bóp','wallet','purse'],
      tui: ['tui','túi','bag','handbag','clutch','crossbody'],
      kinh: ['kinh','kính','sunglass','eyewear','glass']
    };
    let top = [];
    if (requestedType && preferredKeywordsByType[requestedType]) {
      const kws = preferredKeywordsByType[requestedType];
      const preferredFromAccessory = accessoryRows.filter(r => kws.some(k => ((r.category_name||'') + ' ' + (r.name||'')).toLowerCase().includes(k)));
      const remainingAccessory = accessoryRows.filter(r => !preferredFromAccessory.includes(r));
      // merge preferred first, then remaining accessory rows, then non-accessory rows
      top = preferredFromAccessory.concat(remainingAccessory, nonAccessoryRows).slice(0, 6);
    } else {
      top = accessoryRows.concat(nonAccessoryRows).slice(0, 6);
    }
    const names = top.map((x, i) => {
      const shortDesc = x.description ? (` - ${String(x.description).split('.').slice(0,1).join('.').trim()}`) : '';
      return `${i+1}. ${x.name}${x.color ? ` (${x.color})` : ''}${shortDesc}`;
    }).join('\n');

    const reply = `Mình tìm được ${top.length} mẫu${displayType ? ' ' + displayType : ''} đẹp đây ạ:\n${names}\nBạn thích mẫu nào nhất mình show chi tiết nè?`;

    // quickReplies: Mẫu 1..Mẫu N (N = top.length, up to 6) then "Không thích cái nào"
    const quickReplies = top.map((_, i) => `Mẫu ${i+1}`);
    if (top.length === 7) quickReplies.push('Xem thêm');
    quickReplies.push('Không thích cái nào');
    const followUp = { quickReplies, extra: [] };
  
    // Lưu tin nhắn assistant
    if (sessionId) {
      await client.query(
        `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
         VALUES ($1, 'assistant', $2, $3::jsonb, NOW())`,
        [sessionId, reply, JSON.stringify({ type: 'accessories', items: top, followUp })]
      );
    }

    try {
      await client.query(
        `INSERT INTO ai_recommendations (user_id, context, items, model_version, created_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())`,
        [
          userId,
          JSON.stringify({ message: message || '', type: 'accessories' }),
          JSON.stringify({ accessories: top.map(t => ({
            variant_id: String(t.variant_id),
            product_id: String(t.product_id || ''),
            name: t.name,
            description: t.description || null,
            color: t.color,
            price: t.price
          })) }),
          'luna-accessories-v1'
        ]
      );
    } catch (e) {
      console.warn('[suggestAccessories] failed to persist ai_recommendations (non-fatal)', e && e.stack ? e.stack : e);
    }

    return { reply, accessories: top, data: top, followUp };

  } catch (err) {
    console.error('[suggestAccessories] error', err);
    return { reply: 'Luna đang chọn phụ kiện, bạn đợi xíu nha~', accessories: [], data: [] };
  } finally {
    client.release();
  }
};

// Retrieve a single item detail from last recommendation (resolve by "áo/quần/món 1/mẫu 2/đó")
exports.retrieveLastItemDetails = async (userId, sessionId = null, message = '', opts = {}) => {
  const client = await pool.connect();
  try {
    const last = await exports.getLastRecommendationForUser(userId);
    if (!last) return { ask: 'Mình chưa có outfit gợi ý nào trước đó.', sessionId };

    let recJson = last.items;
    if (typeof recJson === 'string') {
      try { recJson = JSON.parse(recJson); } catch (e) { recJson = null; }
    }
    const outfits = recJson && recJson.outfits ? recJson.outfits : [];
    if (!outfits.length) return { ask: 'Mình chưa có outfit gợi ý nào trước đó.', sessionId };

    // pick outfit index if user said "outfit 2" or default to first
    let outfitIndex = 0;
    const idxMatch = String(message || '').match(/(?:outfit|bộ|mẫu|set|thứ)\s*(\d+)/i) || String(message || '').match(/(?:món|mẫu)\s*(\d+)/i);
    if (idxMatch) {
      const n = Number(idxMatch[1]);
      if (!Number.isNaN(n) && outfits[n - 1]) outfitIndex = n - 1;
    }
    const selected = outfits[outfitIndex] || outfits[0];
    const variantIds = Array.isArray(selected.items) ? selected.items.map(String) : [];
    if (variantIds.length === 0) return { ask: 'Bộ gợi ý không có thông tin sản phẩm chi tiết.', sessionId };

    // heuristics: detect piece intent (top/bottom/áo/quần/đầm...)
    const txt = String(message || '').toLowerCase();
    const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const wantTop = /\b(áo|cái áo|chiếc áo|top|shirt|blouse|sơ mi|áo len|áo khoác|áo thun|đầm|dress)\b/i.test(txt) || /\bao\b/i.test(txt);
    const wantBottom = /\b(quần|pants|jean|short|skirt|váy|kaki|trousers|chino)\b/i.test(txt);
 
    // try to find matching variant in outfit.meta if available
    let candidateVariant = null;
    if (Array.isArray(selected.meta) && selected.meta.length) {
      for (let i = 0; i < selected.meta.length; i++) {
        const m = selected.meta[i] || {};
        const pname = String(m.product_name || '').toLowerCase();
        const cat = String(m.category_name || '').toLowerCase();
        if (wantTop && (pname.includes('áo') || /top|shirt|dress|jacket|coat/.test(cat))) { candidateVariant = String(m.variant_id || selected.items[i]); break; }
        if (wantBottom && (pname.includes('quần') || /quần|pants|jean|skirt|trousers/.test(cat))) { candidateVariant = String(m.variant_id || selected.items[i]); break; }
      }
    }

    // if not resolved, try simple ordinal like "món 1" -> pick that item index
    if (!candidateVariant) {
      const ordMatch = String(message || '').match(/món\s*(\d+)/i) || String(message || '').match(/mẫu\s*(\d+)/i);
      if (ordMatch) {
        const k = Number(ordMatch[1]) - 1;
        if (!Number.isNaN(k) && variantIds[k]) candidateVariant = variantIds[k];
      }
    }

    // if still not found and user used "cái đó/đó" or generic phrase and outfit has only one notable piece, return first item
    if (!candidateVariant) {
      if (variantIds.length === 1 || /\b(cái đó|cái vừa rồi|vừa rồi|đó)\b/i.test(txt)) candidateVariant = variantIds[0];
    }

    if (!candidateVariant) {
      // If user explicitly referenced "cái áo / chiếc áo" but we failed to map, try to pick the first TOP found in meta/items
      if (/\b(cái áo|chiếc áo|cái đó|chiếc đó|cái áo đó|áo đó)\b/i.test(txt)) {
        if (Array.isArray(selected.meta) && selected.meta.length) {
          for (let i = 0; i < selected.meta.length; i++) {
            const m = selected.meta[i] || {};
            const pname = _norm(m.product_name || '');
            const cat = _norm(m.category_name || '');
            if (pname.includes('ao') || /top|shirt|blouse|dress/.test(cat)) { candidateVariant = String(m.variant_id || selected.items[i]); break; }
          }
        }
        if (!candidateVariant && variantIds.length) {
          // fallback: choose first item (better than asking again)
          candidateVariant = variantIds[0];
        }
      }

      // try fuzzy match against product names in stored meta (loosen)
      const tokens = (txt.match(/\b[^\s]+\b/g) || []).slice(0,6);
      if (Array.isArray(selected.meta) && selected.meta.length) {
        for (let i = 0; i < selected.meta.length; i++) {
          const m = selected.meta[i] || {};
          const combined = `${m.product_name || ''} ${m.category_name || ''}`.toLowerCase();
          for (const t of tokens) {
            if (t.length < 2) continue;
            if (combined.includes(t)) { candidateVariant = String(m.variant_id || selected.items[i]); break; }
          }
          if (candidateVariant) break;
        }
      }
    }

    if (!candidateVariant) {
      return { ask: 'Bạn đang muốn thông tin về món nào trong bộ vừa rồi (ví dụ: "cái quần", "cái áo" hoặc "món 1")?', sessionId };
    }

    // fetch variant + product info
    const q = await client.query(
      `SELECT pv.id AS variant_id, pv.color_name, pv.sizes, pv.sku, pv.stock_qty,
              p.id AS product_id, p.name AS product_name, p.description,
              pi.url AS image_url, c.name AS category_name
       FROM product_variants pv
       JOIN products p ON pv.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN product_images pi ON pi.variant_id = pv.id AND pi.position = 1
       WHERE pv.id = $1 LIMIT 1`,
      [candidateVariant]
    );
    if (!q.rowCount) return { reply: 'Mình không tìm thấy thông tin chi tiết cho món đó.', sessionId };

    const r = q.rows[0];
    const item = {
      variant_id: String(r.variant_id),
      product_id: r.product_id ? String(r.product_id) : null,
      name: r.product_name || null,
      category: r.category_name || null,
      color: r.color_name || null,
      sizes: r.sizes || null,
      sku: r.sku || null,
      description: r.description || null,
      image: r.image_url || null,
      available: (typeof r.stock_qty === 'number') ? (r.stock_qty > 0) : null
    };

    // build concise reply (single-item)
    const parts = [];
    if (item.name) parts.push(item.name);
    if (item.color) parts.push(`màu ${item.color}`);
    if (item.sizes) parts.push(`sizes: ${item.sizes}`);
    const shortDesc = item.description ? String(item.description).split('.').slice(0,1).join('.').trim() : null;
    if (shortDesc) parts.push(shortDesc);
    const reply = parts.length ? `${parts.join(' — ')}.` : `Đây là thông tin món bạn yêu cầu.`;

    // persist assistant reply with structured metadata for UX
    if (sessionId) {
      try {
        await client.query(
          `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at)
           VALUES ($1, 'assistant', $2, $3::jsonb, NOW())`,
          [sessionId, reply, JSON.stringify({ item })]
        );
        await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);
      } catch (e) { /* non-fatal */ }
    }

    return { reply, item, sessionId };
  } finally {
    client.release();
  }
};

// exports.saveRecommendation = async (userId, recommendationData = {}) => {
//   const {
//     type = 'outfit',
//     items = {},
//     context = {},
//     sessionId = null,
//     model_version = 'luna-v1'
//   } = recommendationData;

//   console.debug('[aiRecommendationService.saveRecommendation] entry', {
//     userId,
//     payloadPreview: {
//       type: recommendationData?.type,
//       itemsCount: Array.isArray(recommendationData?.items) ? recommendationData.items.length : (recommendationData?.items ? 'object' : 0),
//       sessionId: recommendationData?.sessionId || null
//     }
//   });

//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');
//     const result = await client.query(
//       `INSERT INTO ai_recommendations
//         (user_id, context, items, model_version, created_at)
//       VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
//       RETURNING id`,
//       [
//         userId,
//         JSON.stringify(context || {}),
//         JSON.stringify(items || []),
//         model_version
//       ]
//     );

//     const recommendationId = result.rowCount ? result.rows[0].id : null;
//     await client.query('COMMIT');
//     console.debug('[aiRecommendationService.saveRecommendation] saved ok', { userId, result: result && (result.rows ? result.rows[0] : result) });
//     return { success: true, recommendationId };
     
//   } catch (err) {
//     try { await client.query('ROLLBACK'); } catch(_) { /* ignore */ }
//     console.error('[aiService.saveRecommendation] error:', err && err.stack ? err.stack : err);
//     return { success: false, error: err && err.message ? err.message : String(err) };
//   } finally {
//     client.release();
//   }
// };

// ...existing code...
exports.saveRecommendation = async (userId, recommendationData = {}) => {
  const {
    type = 'outfit',
    items = {},
    context = {},
    sessionId = null,
    model_version = 'luna-v1'
  } = recommendationData;

  console.debug('[aiRecommendationService.saveRecommendation] entry', {
    userId,
    payloadPreview: {
      type: recommendationData?.type,
      itemsCount: Array.isArray(recommendationData?.items) ? recommendationData.items.length : (recommendationData?.items ? 'object' : 0),
      sessionId: recommendationData?.sessionId || null
    }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ensure sessionId is persisted inside context so older schemas without session_id column still carry session info
    const finalContext = Object.assign({}, context || {});
    if (sessionId) finalContext.session_id = sessionId;

    const result = await client.query(
      `INSERT INTO ai_recommendations
        (user_id, context, items, model_version, created_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
      RETURNING id`,
      [
        userId,
        JSON.stringify(finalContext || {}),
        JSON.stringify(items || []),
        model_version
      ]
    );

    const recommendationId = result.rowCount ? result.rows[0].id : null;
    await client.query('COMMIT');
    console.debug('[aiRecommendationService.saveRecommendation] saved ok', { userId, result: result && (result.rows ? result.rows[0] : result) });
    return { success: true, recommendationId };

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(_) { /* ignore */ }
    console.error('[aiService.saveRecommendation] error:', err && err.stack ? err.stack : err);
    return { success: false, error: err && err.message ? err.message : String(err) };
  } finally {
    client.release();
  }
};

exports.saveChatMessage = async (userId, payload = {}) => {
  const client = await pool.connect();
  try {
    const { sessionId, role = 'user', content = '', metadata = null } = payload || {};
    let sessId = sessionId || null;

    await client.query('BEGIN');

    // try recover existing session for user if none provided
    if (!sessId) {
      try {
        const sQ = await client.query(
          `SELECT id FROM ai_chat_sessions WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 1`,
          [userId]
        );
        if (sQ.rowCount > 0) sessId = sQ.rows[0].id;
      } catch (e) { /* ignore recovery error */ }
    }

    // create a persistent session when none found
    if (!sessId) {
      const ins = await client.query(
        `INSERT INTO ai_chat_sessions (user_id, context, started_at, last_message_at) VALUES ($1, $2::jsonb, NOW(), NOW()) RETURNING id`,
        [userId, JSON.stringify({})]
      );
      sessId = ins.rows[0].id;
    }

    const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

    await client.query(
      `INSERT INTO ai_chat_messages (session_id, role, content, metadata, created_at) VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [sessId, role, String(content || ''), metaStr]
    );

    await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessId]);

    await client.query('COMMIT');

    return { success: true, sessionId: sessId };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(_) { /* ignore */ }
    console.error('[aiRecommendationService.saveChatMessage] error', err && err.stack ? err.stack : err);
    return { success: false, error: err && err.message ? err.message : String(err) };
  } finally {
    client.release();
  }
};

// alias for compatibility
exports.appendChatMessage = exports.saveChatMessage;

exports.saveRecommendation = async (userId, recommendationData = {}) => {
  const {
    type = 'outfit',
    items = {},
    context = {},
    sessionId = null,
    model_version = 'luna-v1'
  } = recommendationData;

  console.debug('[aiRecommendationService.saveRecommendation] entry', {
    userId,
    payloadPreview: {
      type: recommendationData?.type,
      itemsCount: Array.isArray(recommendationData?.items) ? recommendationData.items.length : (recommendationData?.items ? 'object' : 0),
      sessionId: recommendationData?.sessionId || null
    }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ensure sessionId is persisted inside context so older schemas without session_id column still carry session info
    const finalContext = Object.assign({}, context || {});
    if (sessionId) finalContext.session_id = sessionId;

    const result = await client.query(
      `INSERT INTO ai_recommendations
        (user_id, context, items, model_version, created_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
      RETURNING id`,
      [
        userId,
        JSON.stringify(finalContext || {}),
        JSON.stringify(items || []),
        model_version
      ]
    );

    const recommendationId = result.rowCount ? result.rows[0].id : null;
    await client.query('COMMIT');
    console.debug('[aiRecommendationService.saveRecommendation] saved ok', { userId, result: result && (result.rows ? result.rows[0] : result) });
    return { success: true, recommendationId };

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(_) { /* ignore */ }
    console.error('[aiService.saveRecommendation] error:', err && err.stack ? err.stack : err);
    return { success: false, error: err && err.message ? err.message : String(err) };
  } finally {
    client.release();
  }
};

//Khi user hỏi "cái túi lần trước"
exports.getLastRecommendationForUser = async (userId, type = null) => {
  const client = await pool.connect();
  try {
    let sql = `
      SELECT id, items, context, created_at
      FROM ai_recommendations
      WHERE user_id = $1
    `;
    const params = [userId];

    if (type) {
      sql += ` AND (context->>'type') = $2`;
      params.push(type);
    }

    sql += ` ORDER BY created_at DESC LIMIT 1`;

    const res = await client.query(sql, params);
    const row = res.rows[0] || null;
    if (!row) return null;

    // parse items/context so callers get canonical shapes
    let parsedItems = row.items;
    try {
      if (typeof parsedItems === 'string') parsedItems = JSON.parse(parsedItems);
    } catch (e) { /* ignore parse error, keep raw */ }

    let parsedContext = row.context;
    try {
      if (typeof parsedContext === 'string') parsedContext = JSON.parse(parsedContext);
    } catch (e) { /* ignore parse error */ }

    // derive session_id from stored context if present (compatibility)
    const session_id = parsedContext?.sessionId || parsedContext?.session_id || null;

    return {
      id: row.id,
      session_id,
      items: parsedItems,
      context: parsedContext,
      created_at: row.created_at
    };
  } finally {
    client.release();
  }
};