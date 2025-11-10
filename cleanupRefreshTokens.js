const pool = require('./config/db'); // dùng pool có sẵn của project

const cleanupExpiredRefreshTokens = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE refresh_tokens
       SET revoked = TRUE
       WHERE expires_at <= NOW() AND revoked = FALSE`
    );
    await client.query('COMMIT');
    console.log(`Cleaned up ${result.rowCount} expired refresh tokens`);
    return result.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cleaning up expired refresh tokens:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Nếu bạn import file để scheduling, dùng exported function.
// Nếu chạy trực tiếp: node cleanupRefreshTokens.js
if (require.main === module) {
  cleanupExpiredRefreshTokens()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { cleanupExpiredRefreshTokens };
