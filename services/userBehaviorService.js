const pool = require('../config/db');

/**
 * Lấy các event gần nhất của user
 * @param {string} userId
 * @param {number} limit
 */
exports.getRecentEvents = async (userId, limit = 50) => {
const client = await pool.connect();
try {
    const q = `
    SELECT id, event_type, metadata, created_at
    FROM user_behavior_events
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `;
    const { rows } = await client.query(q, [userId, limit]);
    return rows;
} finally {
    client.release();
}
};

/**
 * Đếm số event theo loại trong window (days)
 * @param {string} userId
 * @param {number} days
 */
exports.getEventCounts = async (userId, days = 30) => {
const client = await pool.connect();
try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const q = `
    SELECT event_type, COUNT(*) AS cnt
    FROM user_behavior_events
    WHERE user_id = $1 AND created_at > $2
    GROUP BY event_type
    `;
    const { rows } = await client.query(q, [userId, since]);
    // normalize to object { view: 10, add_to_cart: 2, ... }
    const out = {};
    rows.forEach(r => { out[r.event_type] = Number(r.cnt); });
    return out;
} finally {
    client.release();
}
};

/**
 * Top interacted variant_ids theo số lần tương tác trong window (days)
 * Trả về array [{ variant_id, count }]
 */
exports.getTopInteractedVariants = async (userId, limit = 10, days = 90) => {
const client = await pool.connect();
try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const q = `
    SELECT metadata->>'variant_id' AS variant_id, COUNT(*) AS cnt
    FROM user_behavior_events
    WHERE user_id = $1 AND metadata->>'variant_id' IS NOT NULL AND created_at > $2
    GROUP BY variant_id
    ORDER BY cnt DESC
    LIMIT $3
    `;
    const { rows } = await client.query(q, [userId, since, limit]);
    return rows.map(r => ({ variant_id: r.variant_id, count: Number(r.cnt) }));
} finally {
    client.release();
}
};

/**
 * Xây dựng đoạn text ngắn làm context cho embedding/LLM:
 * lấy top interacted variants, map sang tên product, trả chuỗi nối
 * @param {string} userId
 * @param {object} opts { limitVariants = 10, days = 90 }
 */
exports.buildUserContextText = async (userId, opts = {}) => {
const { limitVariants = 8, days = 90 } = opts;
const client = await pool.connect();
try {
    const top = await exports.getTopInteractedVariants(userId, limitVariants, days);
    if (!top || top.length === 0) return `user:${userId}:no_recent_interactions`;

    const variantIds = top.map(t => t.variant_id);
    // fetch product names for these variants
    const q = `
    SELECT pv.id AS variant_id, p.name AS product_name
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = ANY($1::text[])
    `;
    const { rows } = await client.query(q, [variantIds]);
    // map id -> name
    const nameMap = {};
    rows.forEach(r => { nameMap[r.variant_id] = r.product_name; });

    // build context text: product names weighted by interaction count
    const parts = top.map(t => {
    const name = nameMap[t.variant_id] || t.variant_id;
    return `${name}`; // can add counts if desired: `${name}(${t.count})`
    });

    // join with separator suitable for embedding
    return parts.join(' || ');
} finally {
    client.release();
}
};

const VALID_EVENT_TYPES = new Set(['view','impression','add_to_cart','remove_from_cart','purchase','checkout_start','search','like','wishlist','feedback','session_start','session_end']);

/**
 * Log 1 event vào user_behavior_events
 * @param {{userId: string|null, eventType: string, metadata: object}} opts
 * @returns {Promise<object>} inserted row
 */
exports.logEvent = async ({ userId = null, eventType, metadata = {} }) => {
if (!eventType || typeof eventType !== 'string') {
    const err = new Error('eventType is required');
    err.status = 400;
    throw err;
}
if (!VALID_EVENT_TYPES.has(eventType)) {
    // allow unknown but warn; change to error if you want strict
    console.warn('[userEventService] unknown event_type:', eventType);
}

const client = await pool.connect();
try {
    await client.query('BEGIN');
    const q = `INSERT INTO user_behavior_events (user_id, event_type, metadata, created_at)
            VALUES ($1, $2, $3::jsonb, NOW())
            RETURNING id, user_id, event_type, metadata, created_at`;
    const params = [userId, eventType, metadata];
    const { rows } = await client.query(q, params);
    await client.query('COMMIT');
    return rows[0];
} catch (err) {
    await client.query('ROLLBACK');
    throw err;
} finally {
    client.release();
}
};

/**
 * Lấy các event gần nhất của user
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
exports.getRecentEventsByUser = async (userId, limit = 50) => {
if (!userId) return [];
const { rows } = await pool.query(
    `SELECT id, user_id, event_type, metadata, created_at
    FROM user_behavior_events
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2`,
    [userId, Number(limit)]
);
return rows;
};

/**
 * Lấy events theo session_id (metadata->>'session_id')
 */
exports.getEventsBySession = async (sessionId, limit = 100) => {
if (!sessionId) return [];
const { rows } = await pool.query(
    `SELECT id, user_id, event_type, metadata, created_at
    FROM user_behavior_events
    WHERE metadata->>'session_id' = $1
    ORDER BY created_at DESC
    LIMIT $2`,
    [sessionId, Number(limit)]
);
return rows;
};
