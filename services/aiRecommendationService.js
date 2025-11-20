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

exports.generateOutfitRecommendation = async (userId, occasion = "hằng ngày", weather = "25°C, nắng nhẹ") => {
    try {
        // 1. Lấy thông tin user
        const userQuery = await pool.query(
        `SELECT full_name, phone FROM users WHERE id = $1`,
        [userId]
        );
        const user = userQuery.rows[0];

        if (!user) throw new Error("User not found");

        // 2. Lấy sản phẩm yêu thích (favorite)
        const favoritesQuery = await pool.query(
        `SELECT p.id, p.name 
        FROM favorite f 
        JOIN products p ON f.product_id = p.id 
        WHERE f.user_id = $1 
        ORDER BY f.seq DESC LIMIT 10`,
        [userId]
        );

        // 3. Lấy sản phẩm đã mua (order_items)
        const purchasedQuery = await pool.query(`
        SELECT DISTINCT p.id, p.name, oi.name_snapshot as bought_name
        FROM order_items oi
        JOIN product_variants pv ON pv.id = oi.variant_id
        JOIN products p ON p.id = pv.product_id
        JOIN orders o ON o.id = oi.order_id
        WHERE o.user_id = $1 AND o.payment_status = 'paid'
        LIMIT 10
        `, [userId]);

        // 4. Lấy toàn bộ sản phẩm đang bán
        const productsQuery = await pool.query(`
        SELECT 
            p.id,
            p.name,
            p.description,
            COALESCE(p.final_price, p.price)::integer as price,
            pv.color_name,
            c.name as category_name,
            pv.stock_qty
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id
        JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'active' AND pv.stock_qty > 0
        LIMIT 80
        `);

        const products = productsQuery.rows;
        const favorites = favoritesQuery.rows;
        const purchased = purchasedQuery.rows;

        // 5. Tạo prompt cực chất (đã test chạy ngon)
        const prompt = `
        Bạn là Luna – stylist thời trang cao cấp của Việt Nam, cực kỳ am hiểu GenZ và xu hướng 2025.

        Hãy gợi ý đúng 3 outfit hoàn chỉnh và đẹp nhất cho khách hàng dưới đây.
        Chỉ được chọn sản phẩm từ danh sách bên dưới (dùng đúng ID).

        Thông tin khách hàng:
        - Tên: ${user.full_name || "Bạn"}
        - Số điện thoại: ${user.phone || "Chưa có"}
        - Đã mua trước đây: ${purchased.map(i => i.bought_name || i.name).join(', ') || "Chưa mua gì"}
        - Yêu thích (wishlist): ${favorites.map(f => f.name).join(', ') || "Chưa có"}
        - Dịp hôm nay: ${occasion}
        - Thời tiết: ${weather}
        - Xu hướng hot 2025: chocolate brown, wide-leg jeans, oversized blazer, varsity jacket, quiet luxury

        Danh sách sản phẩm (ID - Tên - Màu - Giá - Phân loại):
        ${products.map(p => `${p.id} - ${p.name} - ${p.color_name || 'Không màu'} - ${p.price}k - ${p.category_name}`).join('\n')}

        Trả về đúng định dạng JSON sau, không thêm bất kỳ chữ nào khác:

        {
        "outfits": [
            {
            "name": "Tên outfit thật chất, kiểu GenZ Việt Nam",
            "description": "Mô tả ngắn 1-2 câu cực cuốn",
            "items": ["uuid1", "uuid2", "uuid3"],
            "why": "Lý do hợp với khách (hành vi, thời tiết, xu hướng...)"
            }
        ]
        }
        `;

        // call OpenAI via utils wrapper
        let completion;
        try {
          completion = await openai.createChatCompletion({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.85,
            max_tokens: 1200,
          });
        } catch (err) {
          console.error('OpenAI call failed:', err && err.stack ? err.stack : err);
          throw err;
        }
        const content = (completion?.choices?.[0]?.message?.content || completion?.choices?.[0]?.text || '').trim();
 
         const jsonMatch = content.match(/\{[\s\S]*\}/);
 
         if (!jsonMatch) {
         console.log("AI trả về không có JSON:", content);
         throw new Error("AI response not valid JSON");
         }
 
         const result = JSON.parse(jsonMatch[0]);
 
         // Lưu lịch sử gợi ý
        await pool.query(
          `INSERT INTO ai_recommendations (user_id, context, items, model_version)
           VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
          [
            userId,
            JSON.stringify({ occasion, weather, favorites: favorites.map(f => f.id), purchased: purchased.map(p => p.id) }),
            JSON.stringify(result),
            'gpt-4o-mini'
          ]
        );
 
         return result.outfits || [];
 
     } catch (error) {
         console.error("AI Recommendation Error:", error.message);
         throw error;
     }
 };
