const pool = require('../config/db');
const bcrypt = require('bcrypt');

const getUsers = async (role, status)=> {
    let query = 'SELECT id, email, full_name, name, phone, role, status, created_at FROM users WHERE role = $1';
    const params = ['customer'];
    if(status){
        query += ' AND status = $2';
        param.push(status);
    }
    const result = await pool.query(query, params);
    return result.rows;
};

const banUser = async (userId, action)=>{
    const newStatus = action === 'ban' ? 'banned' : 'active';
    const result = await pool.query(
        'UPDATE users SET status = $1 WHERE id = $2 AND role = $3 RETURNING *',
        [newStatus, userId, 'customer']
    );
    if(result.rowCount === 0){
        throw new Error('User not found or cannot be banned/unbanned');
    }
    return result.rows[0];
};

const createUser = async (userData) => {
  const { email, password, full_name, phone } = userData;
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (email, password_hash, full_name, name, phone, role, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id, email, full_name, name, phone, role, status, created_at',
    [email, passwordHash, full_name || null, null, phone || null, 'customer', 'active']
  );
  return result.rows[0];
};

const updateUser = async (userId, updateData)=>{
    const { full_name, phone, name } = updateData;
    const result = await pool.query(
        'UPDATE users SET full_name = $1, name = $2, phone = $3, updated_at = NOW() WHERE id = $4 AND role = $5 RETURNING id, email, full_name, phone, role, status, created_at',
        [full_name || null, name || null, phone || null, userId, 'customer']
    );
    if (result.rowCount === 0){
        throw new Error('User not found or cannot be updated');
    }
    return result.rows[0];
}

const deleteUser = async (userId) => {
  console.log('Executing deleteUser query for userId:', userId); // Debug
  const result = await pool.query(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = $3 RETURNING id, email, full_name, name, role, status, updated_at',
    ['banned', userId, 'customer']
  );
  if (result.rowCount === 0) throw new Error('User not found or not a customer');
  return result.rows[0];
};

module.exports = {
    getUsers,
    banUser,
    createUser,
    updateUser,
    deleteUser
};