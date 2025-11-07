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

const deactiveUser = async (userId) => {
    //Kiểm tra status trước
    const checkResult = await pool.query(
        'SELECT status FROM users WHERE id = $1 AND role = $2',
        [userId, 'customer']
    );
    if (checkResult.rowCount === 0) throw new Error('User not found or not a customer');
    if (checkResult.rows[0].status !== 'active') throw new Error ('User is not active');

    //Xử lý update nếu pass check
    const result = await pool.query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['banned', userId]
    );
    return result.rows[0];
};

const restoreUser = async (userId) => {
    const checkResult = await pool.query(
        'SELECT status FROM users WHERE id = $1 AND role = $2',
        [userId, 'customer']
    );
    if (checkResult.rowCount === 0) throw new Error('User not found or not a customer');
    if (checkResult.rows[0].status !== 'banned') throw new Error ('User is not banned');
    const result = await pool.query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        ['active', userId]
    );
    return result.rows[0];
};

const hardDeleteUser = async (userId) => {
    //Xóa liên quan trước (cascade)
    await pool.query('DELETE FROM orders WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM reviews WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM carts WHERE user_id = $1', [userId]);

    //Xóa user
    const result = await pool.query(
        'DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id',
        [userId, 'customer']
    );
    if (result.rowCount === 0) throw new Error('User not found or not a customer');
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

const getUsersById = async (userId) =>{
    const result = await pool.query(
        'SELECT id, email, full_name, name, phone, role, status, created_at, updated_at FROM users WHERE id = $1 AND role = $2',
        [userId, 'customer']
    );
    if (result.rowCount === 0){
        throw new Error('User not found or not a customer');
    }
    return result.rows[0];
};

const updateUserRole = async (userId, newRole)=>{
    if(!['customer', 'admin'].includes(newRole)) throw new Error('Invalid role');
    const result = await pool.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, name, phone, role, status, updated_at',
        [newRole, userId]
    );
    if(result.rowCount === 0) throw new Error('User not found');
    return result.rows[0];
}


module.exports = {
    getUsers,
    deactiveUser,
    restoreUser,
    hardDeleteUser,
    createUser,
    getUsersById,
    updateUser,
    updateUserRole,
};
