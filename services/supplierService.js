const pool = require('../config/db');

async function createSupplier(data) {
  let client;
  try {
    if (!data || !data.name) {
      throw new Error('Name is required');
    }

    client = await pool.connect();

    const query = `
      INSERT INTO suppliers (name, contact_info, image)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const values = [data.name, data.contact_info || null, data.image || null];

    const result = await client.query(query, values);

    return { id: result.rows[0].id };
  } catch (error) {
    console.error('supplierService.createSupplier error:', error && error.stack ? error.stack : error);
    throw error; // để controller bắt và trả response thích hợp
  } finally {
    if (client) client.release();
  }
}

module.exports = { createSupplier };