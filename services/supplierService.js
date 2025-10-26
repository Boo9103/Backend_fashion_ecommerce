const pool = require('../config/db');
const validator = require('validator');

exports.createSupplier = async (supplierData) => {
  const { name, contact_email, phone, logo_url } = supplierData;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new Error('Name is required');
  }

  if(contact_email && !validator.isEmail(contact_email)){
    throw new Error('Invalid email format');
  }

  if (phone && !validator.isMobilePhone(phone, 'vi-VN')) {
    throw new Error('Invalid phone number');
  }

  const result = await pool.query(
    'INSERT INTO suppliers (name, contact_email, phone, logo_url, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name, contact_email, phone, logo_url, created_at',
    [name.trim(), contact_email || null, phone || null, logo_url || null]
  );
  return result.rows[0];
};

exports.updateSupplier = async (id, data)=> {
  const { name, contact_email, phone, logo_url } = data;
  if (contact_email && !validator.isEmail(contact_email)) {
    throw new Error('Invalid contact email');
  }
  if (phone && !validator.isMobilePhone(phone, 'vi-VN')) {
    throw new Error('Invalid phone number');
  }
  const result = await pool.query(
    'UPDATE suppliers SET name = $1, contact_email = $2, phone = $3, logo_url = $4, updated_at = NOW() WHERE id = $5 RETURNING id, name, contact_email, phone, logo_url, updated_at',
    [name.trim(), contact_email || null, phone || null, logo_url || null, id]
  );
  if (result.rowCount === 0) {
    throw new Error('Supplier not found');
  }
  return result.rows[0];
};


exports.getSuppliers = async ()=> {
  const result = await pool.query(
    'SELECT id, name, contact_email, phone, logo_url, created_at FROM suppliers'
  );
  return result.rows;
};

exports.getSupplierById = async (id)=>{
  const result = await pool.query(
    'SELECT id, name, contact_email, phone, logo_url, created_at FROM suppliers WHERE id = $1', [id]
  );
  return result.rows[0];
};

exports.deleteSupplier = async (id, cascade = false) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra sản phẩm liên quan
    const checkProducts = await client.query('SELECT id FROM products WHERE supplier_id = $1', [id]);
    if (checkProducts.rowCount > 0) {
      if (!cascade) throw new Error('Supplier has associated products');
      // Nếu cascade=true, xóa tất cả sản phẩm liên quan trước
      await client.query('DELETE FROM products WHERE supplier_id = $1', [id]);
    }

    // Xóa supplier
    const result = await client.query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) throw new Error('Supplier not found');

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};