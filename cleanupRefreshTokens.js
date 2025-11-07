const {pool} = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const cleanupExpiredRefreshTokens = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'UPDATE refresh_tokens SET revolked = TRUE WHERE expires_at <= NOW() && revolked = FALSE'
        );
        console.log(`Cleaned up ${result.rowCount} expired refresh tokens`);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error cleaning up expired refresh tokens:', error);
    } finally {
        client.release();
    }
}

cleanupExpiredRefreshTokens();
