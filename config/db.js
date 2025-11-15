const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}
if (!connectionString) {
  throw new Error('DATABASE_URL is not set in environment variables');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false } // Bắt buộc cho Render
});

module.exports = pool;