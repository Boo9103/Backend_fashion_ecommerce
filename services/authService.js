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

const refresh = async (refreshToken) => {
    const client = await pool.connect();
    try{
        //Tìm refresh_token trong DB
        const result = await client.query(
            'SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = FALSE AND expires_at > NOW()',
            [refreshToken]
        );
        if(result.rows.length === 0){
            throw new Error('Invalid refresh token');
        }
        const tokenData = result.rows[0];
        // Kết quả: Nếu hợp lệ, tokenData = { id: uuid, user_id: '123', token: 'a1b2c3...', expires_at: timestamp, revoked: false }

        //Lấy user từ user_id
        const userResult = await client.query('SELECT id, email, role FROM users WHERE id = $1', [tokenData.user_id]);
        const user = userResult.rows[0];
        //Kết quả: user = { id: '123', email: 'mail@example.com', role: 'customer' }

        //Tạo access truy cập mới
        const newAccessToken = generateToken(user);

        return {accessToken: newAccessToken};
    }finally{
        client.release();
    }
};

const logout = async (refreshToken)=>{
    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token = $ 1', [refreshToken]);
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
module.exports = {register, login, refresh, logout, sendOtp, verifyOtpAndRegister};