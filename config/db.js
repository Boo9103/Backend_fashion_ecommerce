const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: Number(process.env.PG_POOL_MAX || 30),               // increased default
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000)
});

pool.on('error', (err, client) => {
  console.error('[pg pool] unexpected error on idle client', err && (err.stack || err.message || err));
});

// convenience helper to get client with logging
pool.connectWithLogging = async function connectWithLogging() {
  try {
    return await pool.connect();
  } catch (err) {
    console.error('[pg connect] failed to get client from pool', { message: err && err.message, stack: err && err.stack });
    throw err;
  }
};

// helper to show current pool status for quick diagnostics
pool.logStatus = function logStatus(prefix = '') {
  try {
    console.debug(`[pg pool] ${prefix} total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`);
  } catch (e) { /* ignore */ }
};

module.exports = pool;
