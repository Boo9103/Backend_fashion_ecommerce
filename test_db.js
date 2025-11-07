const pool = require('./config/db');

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL database!');
    const result = await client.query('SELECT NOW()');
    console.log('Current time from DB:', result.rows[0].now);
    const tables = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log('Tables in fashion_ecommerce:', tables.rows.map(row => row.table_name));
    client.release();
  } catch (err) {
    console.error('Error connecting to database:', err.message);
  }
}

testConnection();
