
  const pool = require('../config/db');
  const fs = require('fs').promises;
  const path = require('path');

  async function runMigrations() {
    const client = await pool.connect();
    try {
      const sql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
      await client.query(sql);
      console.log('Migration completed');
    } catch (error) {
      console.error('Migration error:', error);
      throw error; // Để debug lỗi chi tiết
    } finally {
      client.release();
    }
  }

  runMigrations().catch((err) => {
    console.error('Run migrations failed:', err);
    process.exit(1);
  });
