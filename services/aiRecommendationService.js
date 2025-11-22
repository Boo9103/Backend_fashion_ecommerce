const pool = require('../config/db');
// use consistent utils wrapper for OpenAI
let openai = null;
try {
  openai = require('../utils/openai'); // exports { createChatCompletion, chat, client }
} catch (e) {
  console.error('utils/openai.js not found or failed to load:', e && e.message ? e.message : e);
  throw e; // require present file to avoid runtime surprises
}
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
    // if providedSessionId and exists for this user -> resume
    if (providedSessionId) {
      const sRes = await client.query(`SELECT id FROM ai_chat_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`, [providedSessionId, userId]);
      if (sRes.rowCount > 0) {
        const msgs = await client.query(`SELECT role, content, created_at FROM ai_chat_messages WHERE session_id = $1 ORDER BY created_at`, [providedSessionId]);
        await client.query('COMMIT');
        return { sessionId: providedSessionId, messages: msgs.rows, isNew: false };
      }
    }

    // create new session
    const sIns = await client.query(
      `INSERT INTO ai_chat_sessions (user_id, context, started_at, last_message_at)
       VALUES ($1, '{}'::jsonb, NOW(), NOW()) RETURNING id`,
      [userId]
    );
    const sessionId = sIns.rows[0].id;

    // choose welcome message: personalized if user exists
    const uQ = await client.query(`SELECT full_name FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const name = (uQ.rows[0] && uQ.rows[0].full_name) ? uQ.rows[0].full_name.split(' ').pop() : 'bạn';
    const welcome = `Chào ${name}! Mình là Luna đây 😊 Bạn muốn mình gợi ý outfit cho dịp gì nè? Đi chơi, đi làm hay hẹn hò?`;

    await client.query(
      `INSERT INTO ai_chat_messages (session_id, role, content, created_at) VALUES ($1, 'assistant', $2, NOW())`,
      [sessionId, welcome]
    );

    await client.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);

    await client.query('COMMIT');
    return { sessionId, messages: [{ role: 'assistant', content: welcome, created_at: new Date() }], isNew: true };
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

// modified: generateOutfitRecommendation to include size guidance from size_guides
exports.generateOutfitRecommendation = async (userId, occasion, weather, opts = {}) => {
  // opts: { productId, variantId, sessionId, message, maxOutfits }
  if (!occasion || !weather) {
    return { ask: 'Ồ hay quá! Bạn đang muốn mix đồ cho dịp gì nè? Đi chơi, đi làm hay hẹn hò? Thời tiết hôm nay ra sao?' };
  }

  // existing logic (unchanged) but ensure you set/return sessionId if you create one
  try {
        const client = await pool.connect();
        try {
            // fetch user + measurements
            const userQ = await client.query(`SELECT full_name, phone, height, weight, bust, waist, hip FROM users WHERE id = $1 LIMIT 1`, [userId]);
            const user = userQ.rows[0];
            if (!user) throw new Error("User not found");

            // favorites & purchased (existing queries)
            const favoritesQuery = await client.query(
              `SELECT p.id, p.name, p.category_id
               FROM favorite f
               JOIN products p ON f.product_id = p.id
               WHERE f.user_id = $1
               ORDER BY f.seq DESC LIMIT 10`,
              [userId]
            );
            const favorites = favoritesQuery.rows;

            const purchasedQuery = await client.query(`SELECT DISTINCT p.id, p.name, pv.id AS variant_id, p.category_id
              FROM order_items oi
              JOIN product_variants pv ON pv.id = oi.variant_id
              JOIN products p ON p.id = pv.product_id
              JOIN orders o ON o.id = oi.order_id
              WHERE o.user_id = $1 AND o.payment_status = 'paid' LIMIT 10`, [userId]);
            const purchased = purchasedQuery.rows;

            // products candidates (existing)
            const productsQuery = await client.query(`
            SELECT p.id AS product_id, p.name, p.description, COALESCE(p.final_price, p.price)::integer as price,
                   pv.id AS variant_id, pv.color_name, c.name as category_name, pv.stock_qty, p.category_id
            FROM products p
            JOIN product_variants pv ON pv.product_id = p.id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.status = 'active' AND pv.stock_qty > 0
            LIMIT 80
            `);
            const products = productsQuery.rows;

            if (!products || products.length === 0) {
              return { reply: 'Không tìm thấy sản phẩm khả dụng trong kho để gợi ý.', outfits: [], sessionId: null };
            }

            // prefetch size_guides per category present
            const categoryIds = Array.from(new Set(products.map(p => p.category_id).filter(Boolean)));
            const guidesByCategory = {};
            if (categoryIds.length) {
              const sgQ = await client.query(`SELECT id, category_id, size_label, min_height, max_height, min_weight, max_weight, bust, waist, hip FROM size_guides WHERE category_id = ANY($1::uuid[]) ORDER BY size_label`, [categoryIds]);
              for (const row of sgQ.rows) {
                guidesByCategory[row.category_id] = guidesByCategory[row.category_id] || [];
                guidesByCategory[row.category_id].push(row);
              }
            }

            // grouping by category to build outfits deterministic
            const byCat = {};
            const variantSet = new Set();
            products.forEach(r => {
              variantSet.add(r.variant_id);
              const cat = (r.category_name || 'Khác').trim();
              byCat[cat] = byCat[cat] || [];
              byCat[cat].push(r);
            });
            const categories = Object.keys(byCat).sort();

            const outfits = [];
            const maxOutfits = 3;
            for (let i=0;i<Math.min(maxOutfits, 6); i++) {
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
              const b = pickFrom(secondaryIdx) || pickFrom((secondaryIdx+1)%categories.length);
              const c = pickFrom(tertiaryIdx) || pickFrom((tertiaryIdx+2)%categories.length);
              if (a) items.push(a.variant_id);
              if (b) items.push(b.variant_id);
              if (c) items.push(c.variant_id);
              if (items.length === 0) continue;

              // build readable title/description and size recommendation
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

              const title = namesById[items[0]] ? `${namesById[items[0]].category_name || 'Outfit'}: ${namesById[items[0]].product_name}` : `Outfit ${i+1}`;
              const descParts = items.map(id => {
                const n = namesById[id];
                if (!n) return id;
                // description: product name + color + short tip
                return `${n.product_name}${n.color_name ? ' ('+n.color_name+')' : ''}`;
              });
              // compute size recommendation using first item's category guides
              const first = namesById[items[0]];
              let sizeLabel = null;
              if (first && first.category_name && first.product_name) {
                const catIdRow = products.find(p => p.variant_id === items[0]);
                const guides = catIdRow ? guidesByCategory[catIdRow.category_id] : null;
                sizeLabel = pickSizeFromGuides(guides, { height: user.height, weight: user.weight });
              }
              const description = descParts.join(' + ') + `. Gợi ý phối: thử phối cùng phụ kiện nhẹ để hoàn thiện set.`;
              const whyParts = [];
              whyParts.push(`Được chọn dựa trên hàng có sẵn trong kho và phù hợp với dịp "${occasion}" và thời tiết "${weather}".`);
              if (sizeLabel) whyParts.push(`Gợi ý size cho set chính: ${sizeLabel}. (dựa trên bảng size của sản phẩm).`);

              outfits.push({
                name: title,
                description: description,
                items,
                why: whyParts.join(' ')
              });
              if (outfits.length >= maxOutfits) break;
            }

            // persist ai_recommendations normalized
            await client.query(
              `INSERT INTO ai_recommendations (user_id, context, items, model_version)
               VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
              [
                userId,
                JSON.stringify({ occasion, weather, favorites: favorites.map(f => f.id), purchased: purchased.map(p => p.variant_id || p.id) }),
                JSON.stringify({ outfits }),
                'db-heuristic-with-size-guides'
              ]
            );

            return { reply: outfits.map((o,idx) => `Gợi ý ${idx+1}: ${o.name} — ${o.description}`).join('\n\n'), outfits, sessionId: null };
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("AI Recommendation Error:", error && error.stack ? error.stack : error);
        throw error;
    }
};
