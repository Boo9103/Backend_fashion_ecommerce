const aiChatService = require('../services/aiChatService');
const pool = require('../config/db'); // <- thêm import pool chính xác

exports.chat = async (req, res, next) => {
  try {
    const userId = (req.user && (req.user.id || req.user.userId)) || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { message } = req.body || {};
    const result = await aiChatService.startOrContinueChat(userId, message || null);
    return res.json({ success: true, data: { reply: result.reply, outfits: result.outfits, sessionId: result.sessionId } });
  } catch (err) {
    console.error('[aiChatController.chat]', err && err.stack ? err.stack : err);
    next(err);
  }
};

exports.history = async (req, res, next) => {
  try {
    const userId = (req.user && (req.user.id || req.user.userId)) || null;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const history = await pool.query(
      `SELECT s.id as session_id, m.role, m.content, m.created_at
       FROM ai_chat_sessions s
       JOIN ai_chat_messages m ON m.session_id = s.id
       WHERE s.user_id = $1 AND s.last_message_at > NOW() - INTERVAL '24 hours'
       ORDER BY m.created_at`, [userId]
    );

    return res.json({ success: true, messages: history.rows });
  } catch (err) {
    console.error('[aiChatController.history]', err && err.stack ? err.stack : err);
    next(err);
  }
};