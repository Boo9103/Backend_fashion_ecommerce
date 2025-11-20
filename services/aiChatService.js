const pool = require('../config/db');
const openai = require('../utils/openai'); // expects createChatCompletion helper
const WELCOME_MESSAGES = [
"Hí bạn ơi! Luna đây nè 👗 Hôm nay muốn Luna mix đồ kiểu gì nào? Đi chơi, đi làm, hẹn hò hay chill ở nhà cũng được hết á!",
"Chào chủ nhân đẹp nhất hệ mặt trời! ✨ Luna vừa xem tủ đồ của bạn xong rồi, hôm nay phải bung xõa thôi!",
"Luna vừa lướt TikTok thấy trend mới cực cháy, để Luna mix cho bạn liền nha 🔥"
];

async function ensureSession(userId) {
const { rows } = await pool.query(
    `SELECT id FROM ai_chat_sessions WHERE user_id = $1 AND last_message_at > NOW() - INTERVAL '24 hours' ORDER BY last_message_at DESC LIMIT 1`,
    [userId]
);
if (rows.length) return rows[0].id;
const ins = await pool.query(`INSERT INTO ai_chat_sessions (user_id) VALUES ($1) RETURNING id`, [userId]);
return ins.rows[0].id;
}

exports.startOrContinueChat = async (userId, userMessage = null) => {
// get user
const u = await pool.query(`SELECT full_name FROM users WHERE id = $1 LIMIT 1`, [userId]);
const user = u.rows[0] || {};
// ensure session
const sessionId = await ensureSession(userId);

// fetch history
const h = await pool.query(`SELECT role, content FROM ai_chat_messages WHERE session_id = $1 ORDER BY created_at`, [sessionId]);
let messages = h.rows.map(r => ({ role: r.role, content: r.content }));

// if new session and empty, push welcome
if (!messages || messages.length === 0) {
    const welcome = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
    .replace("bạn", (user.full_name || "bạn").split(" ").pop() || "bạn");
    messages.push({ role: 'assistant', content: welcome });
    await pool.query(`INSERT INTO ai_chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`, [sessionId, welcome]);
}

if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
    await pool.query(`INSERT INTO ai_chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`, [sessionId, userMessage]);
}

const systemPrompt = `Bạn là Luna – stylist thời trang cực kỳ dễ thương, 22 tuổi, nói chuyện kiểu GenZ Việt Nam, hay dùng emoji, dí dỏm. 
Tên khách: ${user.full_name || "bạn"}
Khi gợi ý outfit thì nếu cần trả JSON thì bọc JSON bằng <<<OUT FIT>>>...<<<END>>>; nếu không, trả text thân thiện.`;

// call OpenAI via utils wrapper (createChatCompletion)
let completion;
try {
    completion = await openai.createChatCompletion({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20)
    ],
    temperature: 0.9,
    max_tokens: 800
    });
} catch (err) {
    console.error('[aiChatService] OpenAI error:', err && err.stack ? err.stack : err);
    throw Object.assign(new Error('AI service unavailable'), { status: 502 });
}

const aiReply = (completion?.choices?.[0]?.message?.content || completion?.choices?.[0]?.text || '').trim();

// persist assistant reply and update session timestamp
await pool.query(`INSERT INTO ai_chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`, [sessionId, aiReply]);
await pool.query(`UPDATE ai_chat_sessions SET last_message_at = NOW() WHERE id = $1`, [sessionId]);

// extract outfits JSON if present
const outfitMatch = aiReply.match(/<<<OUT FIT>>>([\s\S]*?)<<<END>>>/);
let outfits = null;
if (outfitMatch) {
    try {
    const parsed = JSON.parse(outfitMatch[1]);
    outfits = parsed.outfits || null;
    } catch (e) {
    // ignore parse error, keep outfits null
    console.warn('[aiChatService] cannot parse outfits JSON', e && e.message ? e.message : e);
    }
}

// return cleaned reply (+ outfits if any)
const cleanReply = outfitMatch ? aiReply.replace(outfitMatch[0], '').trim() : aiReply;
return { reply: cleanReply, outfits, sessionId };
};
module.exports = exports;