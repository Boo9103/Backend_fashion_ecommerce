const pool = require('../config/db');
const bcrypt = require('bcrypt');

exports.getUserById = async (userId) => {
    const client = await pool.connect();

    try {
        const res = await client.query(`
            SELECT id, email, full_name, phone, role, status, google_id, name, created_at, updated_at
            FROM users
            WHERE id = $1`, [userId]);

        if (res.rows.length === 0) {
            throw new Error('User not found');
        }
        return res.rows[0] || null;
    }catch (error) {
        throw error;
    } finally {
        client.release();
    }
};

exports.updateUserProfile = async (userId, data = {})=> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const fields = [];
        const params = [];
        idx = 1;

        if (data.full_name !== undefined) {
            fields.push(`full_name = $${idx++}`);
            params.push(data.full_name);
        } 
        if (data.phone !== undefined) {
            fields.push(`phone = $${idx++}`);
            params.push(data.phone);
        }
        if(data.name !== undefined){
            fields.push(`name = $${idx++}`);
            params.push(data.name);
        }

        if(fields.length === 0 ){
            await client.query('COMMIT');
            return await exports.getUserById(userId);
        }

        params.push(userId);
        const q = `
            UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
            WHERE id = $${idx}
            RETURNING id, email, full_name, phone, role, status, google_id, name, created_at, updated_at`;
        
        const { rows } = await client.query(q, params);

        await client.query('COMMIT');
        return rows[0] || null; 

    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.getUserAddresses = async (userId) => {
    const client = await pool.connect();
    try {
        const q = `
            SELECT *
            FROM user_addresses
            WHERE user_id = $1
            ORDER BY is_default DESC, created_at DESC`;
        
        const { rows } = await client.query(q, [userId]);
        return rows;
    } catch (error) {
        throw error;
    } finally {
        client.release();
    }
};

exports.addUserAddress = async (userId, data)=>{
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (data.is_default){
            await client.query(`
                UPDATE user_addresses 
                SET is_default = FALSE
                WHERE user_id = $1`, [userId]);
        }

        const q =` 
            INSERT INTO user_addresses
            (id, user_id, receive_name, phone, address, tag, is_default, created_at, updated_at)
            VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
            RETURNING id, receive_name, phone, address, tag, is_default, created_at, updated_at`;

        const params = [
            userId,
            data.receive_name || null,
            data.phone || null,
            data.address || null,
            data.tag || null,
            !!data.is_default
        ];

        const { rows } = await client.query(q, params);

        await client.query('COMMIT');
        return rows[0] || null;
    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.updateUserAddress = async (userId, addressId, data)=>{
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if(data.is_default){
            await client.query(`
                UPDATE user_addresses 
                SET is_default = FALSE
                WHERE user_id = $1`, [userId]);
        }

        const fields = [];
        const params = [];
        let idx = 1;

        // map các trường nhận từ payload (hỗ trợ cả receive_name hoặc name)
        if (data.receive_name !== undefined) {
            fields.push(`receive_name = $${idx++}`);
            params.push(data.receive_name);
        } else if (data.name !== undefined) {
            fields.push(`receive_name = $${idx++}`);
            params.push(data.name);
        }

        if(data.phone !== undefined){
            fields.push(`phone = $${idx++}`);
            params.push(data.phone);
        }

        if(data.address !== undefined){
            fields.push(`address = $${idx++}`);
            params.push(data.address);
        }
        if(data.tag !== undefined){
            fields.push(`tag = $${idx++}`);
            params.push(data.tag);
        }   
        if(data.is_default !== undefined){
            fields.push(`is_default = $${idx++}`);
            params.push(!!data.is_default);
        }

        if(fields.length === 0){
            await client.query('COMMIT');
            return null;
        }
        params.push(userId, addressId);
        const q = `
            UPDATE user_addresses
            SET ${fields.join(', ')}, updated_at = NOW()
            WHERE user_id = $${idx++} AND id = $${idx}
            RETURNING id, receive_name, phone, address, tag, is_default, created_at, updated_at`;
        
        const { rows } = await client.query(q, params);
        await client.query('COMMIT');
        return rows[0] || null;
    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.deleteUserAddress = async (userId, addressId) => {
    const client = await pool.connect();
    try {
        const q = `
            DELETE FROM user_addresses
            WHERE user_id = $1 AND id = $2
            returning id`;
        const { rows } = await client.query(q, [userId, addressId]);
        return rows.length > 0;
        
    }finally {
        client.release();
    }
};

exports.getUserAddressById = async (userId, addressId) => {
    const client = await pool.connect();
    try {
        const q = `
            SELECT id, receive_name, phone, address, tag, is_default, created_at, updated_at
            FROM user_addresses
            WHERE user_id = $1 AND id = $2
            LIMIT 1`;
        
        const { rows } = await client.query(q, [userId, addressId]);
        return rows[0] || null;

    } finally {
        client.release();
    }
};

exports.setDefaultAddress = async (userId, addressId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        //Kiểm tra địa chỉ có thuộc user không
        const check = await client.query(`
            SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2
            LIMIT 1
        `, [addressId, userId]);
        if(check.rows.length === 0){
            await client.query('ROLLBACK');
            return null; // address không tồn tại hoặc không thuộc user
        }

        // Bỏ flag default ở các address khác của user
        await client.query(`
            UPDATE user_addresses
            SET is_default = FALSE
            WHERE user_id = $1 AND is_default = TRUE`, [userId]);
        
        //Đặt address này là default
        const { rows } = await client.query( `
            UPDATE user_addresses
            SET is_default = TRUE, updated_at = NOW()
            WHERE id = $1 AND user_id = $2
            RETURNING id, receive_name, phone, address, is_default, tag, created_at, updated_at`, [addressId, userId]);
        
        await client.query('COMMIT');
        return rows[0] || null;
    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.deleteUserAccount = async (userId)=> {
    const client = await pool.connect();
    try{
        await client.query('BEGIN');

        //Kiểm tra user tồn tại 
        const check = await client.query(`
            SELECT email FROM users WHERE id = $1
            `, [userId]);

        if(check.rows.length === 0){
            await client.query('ROLLBACK');
            return false; // user không tồn tại
        }
        const userEmail = check.rows[0].email;

        //Xóa dữ liệu con
        await client.query(`DELETE FROM order_items WHERE order_id IN
            (SELECT id FROM orders WHERE user_id = $1)`, [userId]);
        await client.query('DELETE FROM orders WHERE user_id = $1', [userId]);

        // cart -> cart_items
        await client.query(`
            DELETE FROM cart_items
            WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)
        `, [userId]).catch(()=>{});
        await client.query(`DELETE FROM carts WHERE user_id = $1`, [userId]).catch(()=>{});

        await client.query(`
            DELETE FROM user_addresses
            WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);

        //otp_verifications lưu theo email nên xóa theo email
        await client.query('DELETE FROM otp_verifications WHERE email = $1', [userEmail]);

        //Xóa User
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        
        await client.query('COMMIT');
        return true;
    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.deactiveUserAccount = async (userId)=> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        //Kiểm tra user tồn tại
        const check = await client.query(`
            SELECT id FROM users WHERE id = $1
            `, [userId]);
        if(check.rows.length === 0){
            await client.query('ROLLBACK');
            return false; // user không tồn tại
        }

        //Cập nhật status user -> deactive
        const { rows } = await client.query(`
            UPDATE users 
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING id, email, full_name, phone, role, status, google_id, name, created_at, updated_at`,
            ['deactive', userId]);

        //revolked refresh tokens (buột logout)
        await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);

        await client.query('COMMIT');
        return rows[0];
    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.updateUserMeasurement = async (userId, data = {}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const qRes = await client.query(`
            UPDATE users SET height = $1, weight = $2, bust = $3, waist = $4, hip = $5, gender = $6, updated_at = NOW()
            WHERE id = $7
            RETURNING height, weight, bust, waist, hip, updated_at`,
            [
                data.height || null,
                data.weight || null,
                data.bust || null,
                data.waist || null,
                data.hip || null,
                data.gender || null,
                userId
            ]);
        await client.query('COMMIT');
        if (qRes.rowCount === 0) {
            throw new Error('User not found');
        }
        return qRes.rows[0];
    
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }finally {
        client.release();
    }
};

exports.getUserMeasurement = async (userId) => {
    const client = await pool.connect();
    try {
        const q = `
            SELECT height, weight, bust, waist, hip, gender
            FROM users
            WHERE id = $1
            LIMIT 1`;
        const { rows } = await client.query(q, [userId]);
        return rows[0] || null;
    } catch (error) {
        throw error;
    } finally {
        client.release();
    }
};