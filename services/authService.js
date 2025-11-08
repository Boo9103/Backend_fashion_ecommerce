const bcrypt = require('bcrypt');
const pool = require('../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { generateToken, generateFreshToken } = require('../config/jwt');

const register = async ({ email, password, full_name, phone}) => {
    const client = await pool.connect();
    try{
        await client.query('BEGIN');

        //Kiểm tra email đã tồn tại
        const checkEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        if (checkEmail.rows.length > 0){
            throw new Error('Email already exists'); 
        }

        //Băm mật khẩu
        const password_hash = await bcrypt.hash(password, 10);

        //Tạo người dùng mới
        const result = await client.query(
            `INSERT INTO users (email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, full_name, phone, role, status, created_at`,
            [email, password_hash, full_name, phone, 'customer', 'active']
        );

        await client.query('COMMIT');
        return result.rows[0];
    }catch(error){
        await client.query('ROLLBACK');
        throw error;
    }finally{
        client.release();
    }
    
};

const login = async ({email, password}) => {
    const client = await pool.connect();
    try{
        //Tìm user
        const result = await client.query(
            'SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = $1', [email]
        );
        if(result.rows.length === 0) {
            throw new Error('Invalid email or password');
        }
        const user = result.rows[0];

        //Kiểm tra status
        if(user.status === 'banned'){
            throw new Error('Account is banned');
        }

        //Kiểm tra password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if(!isMatch){
            throw new Error('Invalid email or password');
        }

        //Tạo token
        const token = generateToken(user);

        const refreshToken = generateFreshToken();
        const expiresAt = new Date(Date.now() + 7*24*60*60*1000); // 7 ngày
        await client.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, refreshToken, expiresAt]
        );

        return {
            accessToken: token, //jwt ngắn hạn
            refreshToken,   // chuỗi randoom
            user: {id: user.id, email: user.email, full_name: user.full_name, role: user.role}
        };
    }finally {
        client.release();
    }
};

const adminLogin = async ({ email, password }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = $1',
            [email]
        );
        if (result.rows.length === 0) throw new Error('Invalid email or password');
        
        const user = result.rows[0];

        if (user.role !== 'admin') throw new Error('Unauthorized: Admin access only');
        if (user.status === 'banned') throw new Error('Account is banned');
        
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) throw new Error('Invalid email or password');
        
        const token = generateToken(user);
        const refreshToken = generateFreshToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await client.query(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, refreshToken, expiresAt]
        );
        await client.query('COMMIT');
        return {
            accessToken: token,
            refreshToken,
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const refresh = async (refreshToken) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = FALSE',
      [refreshToken]
    );
    if (result.rows.length === 0) throw new Error('Invalid refresh token');
    const tokenData = result.rows[0];

    // Kiểm tra và cập nhật revoked nếu hết hạn
    if (tokenData.expires_at <= new Date()) {
      await client.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1',
        [refreshToken]
      );
      throw new Error('Refresh token has expired');
    }

    const userResult = await client.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [tokenData.user_id]
    );
    const user = userResult.rows[0];
    const newAccessToken = generateToken(user);
    await client.query('COMMIT');
    return { accessToken: newAccessToken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString(); // 6 chữ số

const sendOtp = async (email) => {
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY || '300') * 1000); // Mặc định 5 phút

    const client = await pool.connect();
    try {
        //Kiểm tra lần gửi gần nhất
        const lastOtp = await client.query('SELECT created_at FROM otp_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [email]);
        if (lastOtp.rows.length > 0) {
            const lastSent = new Date(lastOtp.rows[0].created_at);
            const now = new Date();
            if ((now - lastSent) / 1000 < 60) { // Giới hạn 1 phút
                throw new Error('OTP already sent recently. Please wait before requesting again.');
            }
        }

        await client.query('BEGIN');

        //Xóa OTP cũ (nếu có)
        await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

        //Lưu OTP mới
        await client.query(
            'INSERT INTO otp_verifications (email, otp, expires_at) VALUES ($1, $2, $3)',
            [email, otp, otpExpiry]
        );
        await client.query('COMMIT');

        //Gửi email
        const { sendOtpEmail } = require('../config/email');
        await sendOtpEmail(email, otp);
        return { message: 'OTP sent' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const verifyOtpAndRegister = async ({ email, otp, password, full_name, phone }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kiểm tra OTP
    const result = await client.query(
      'SELECT otp FROM otp_verifications WHERE email = $1 AND expires_at > NOW()',
      [email]
    );
    if (result.rows.length === 0 || result.rows[0].otp !== otp) {
      throw new Error('Invalid or expired OTP');
    }

    // Xóa OTP sau verify
    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    // Tiếp tục đăng ký như cũ
    const user = await register({ email, password, full_name, phone });
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const logout = async (refreshToken)=>{
   const client = await pool.connect();
   try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1 RETURNING *', [refreshToken]);
    if(result.rows.length === 0){
        throw new Error('Invalid refresh token');
    }
    await client.query('COMMIT');
   }catch(error){
    await client.query('ROLLBACK');
    throw error;
   }finally{
    client.release();
   }
};


const googleLogin = async (user) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tạo token
    const token = generateToken(user);

    const refreshToken = generateFreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 ngày
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    await client.query('COMMIT');
    return {
      accessToken: token,
      refreshToken,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};


const requestPasswordReset = async (email) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    //Kiểm tra email tồn tại 
    const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      // Trả về message chung để tránh lộ thông tin tài khoản
      await client.query('ROLLBACK'); 
      return { message: 'If this email exists, an OTP has been sent.' };
    }
    const user = userResult.rows[0];
    if (user.status === 'banned') {
      throw new Error('Account is banned');
    }

    // CHỐNG SPAM: kiểm tra lần gửi gần nhất (tương tự sendOtp)
    const lastOtp = await client.query(`
      SELECT created_at FROM otp_verifications
      WHERE email = $1
      ORDER BY created_at DESC LIMIT 1
      `, [email]);
    
    if(lastOtp.rows.length > 0){
      const lastSent = new Date(lastOtp.rows[0].created_at);
      if ((Date.now() - lastSent.getTime()) / 1000 < 60) {
        throw new Error('OTP already sent recently. Please wait before requesting again.');
      }
    }
    
    //Tạo OTP
    const otp = generateOtp();
    const expireSeconds = parseInt(process.env.OTP_EXPIRY || '300'); // mặc định 5p
    const expiresAt = Math.floor(Date.now() / 1000) + expireSeconds;

    //Xóa OTP cũ (nếu có)
    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    //Lưu OTP mới
    await client.query(
      'INSERT INTO otp_verifications (email, otp, expires_at) VALUES ($1, $2, to_timestamp($3))',
      [email, otp, expiresAt]
    );

    await client.query('COMMIT');

    //Gửi email
    const { sendResetPasswordEmail } = require('../config/email');
    await sendResetPasswordEmail(email, otp);
    return { message: 'OTP sent to your email' };
  }catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const verifyOtpAndResetPassword = async ({ email, otp, newPassword }) => {
  const  client = await pool.connect();
  try {
    await client.query('BEGIN');

    //Kiểm tra otp còn hạn và khớp
    const result = await client.query(
      `SELECT otp FROM otp_verifications WHERE email = $1 AND expires_at > NOW()`,
      [email]
    );

    if(result.rows.length === 0 || result.rows[0].otp !== otp){ 
      throw new Error('Invalid or expired OTP');
    }

    //Kiểm tra user tồn tại
    const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);

    if(userResult.rows.length === 0){
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    //Băm mật khẩu mới
    const password_hash = await bcrypt.hash(newPassword, 10);

    //Cập nhật mật khẩu
    await client.query(`
      UPDATE users SET password_hash = $1 WHERE id = $2
      `, [password_hash, user.id]);

    //Xóa OTP sau khi dùng
    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    //revoke tất cả refresh token hiện tại của user
    await client.query(
      'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE',
      [user.id]
    );

    await client.query('COMMIT');
    return { message: 'Password has been reset successfully' };
  }catch(error){
    await client.query('ROLLBACK');
    throw error;  
  }finally{
    client.release();
  }
};

module.exports = {register, login, adminLogin, refresh, logout, sendOtp, verifyOtpAndRegister, googleLogin, requestPasswordReset, verifyOtpAndResetPassword};
