const bcrypt = require('bcrypt');
const pool = require('../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { generateToken, generateFreshToken, verifyToken } = require('../config/jwt');

const register = async ({ email, password, full_name, phone }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkEmail.rows.length > 0) {
      const error = new Error('Email already exists');
      error.statusCode = 409;
      throw error;
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, full_name, phone, role, status, created_at`,
      [email, password_hash, full_name, phone, 'customer', 'active']
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const login = async ({ email, password }) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = $1', [email]
    );
    if (result.rows.length === 0) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }
    const user = result.rows[0];

    if (user.status === 'banned') {
      const error = new Error('Account is banned');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const token = generateToken(user);

    const refreshToken = generateFreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    return {
      accessToken: token,
      refreshToken,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    };
  } finally {
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
    if (result.rows.length === 0) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const user = result.rows[0];

    if (user.role !== 'admin') {
      const error = new Error('Unauthorized: Admin access only');
      error.statusCode = 403;
      throw error;
    }
    if (user.status === 'banned') {
      const error = new Error('Account is banned');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

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
    if (result.rows.length === 0) {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }
    const tokenData = result.rows[0];

    if (tokenData.expires_at <= new Date()) {
      await client.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1',
        [refreshToken]
      );
      const error = new Error('Refresh token has expired');
      error.statusCode = 401;
      throw error;
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

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOtp = async (email) => {
  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + parseInt(process.env.OTP_EXPIRY || '300') * 1000);

  const client = await pool.connect();
  try {
    const lastOtp = await client.query('SELECT created_at FROM otp_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [email]);
    if (lastOtp.rows.length > 0) {
      const lastSent = new Date(lastOtp.rows[0].created_at);
      const now = new Date();
      if ((now - lastSent) / 1000 < 60) {
        const error = new Error('OTP already sent recently. Please wait before requesting again.');
        error.statusCode = 429;
        throw error;
      }
    }

    await client.query('BEGIN');

    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    await client.query(
      'INSERT INTO otp_verifications (email, otp, expires_at) VALUES ($1, $2, $3)',
      [email, otp, otpExpiry]
    );
    await client.query('COMMIT');

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

    const result = await client.query(
      'SELECT otp FROM otp_verifications WHERE email = $1 AND expires_at > NOW()',
      [email]
    );
    if (result.rows.length === 0 || result.rows[0].otp !== otp) {
      const error = new Error('Invalid or expired OTP');
      error.statusCode = 400;
      throw error;
    }

    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

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

const logout = async (refreshToken) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1 RETURNING *', [refreshToken]);
    if (result.rows.length === 0) {
      const error = new Error('Invalid refresh token');
      error.statusCode = 401;
      throw error;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const googleLogin = async (user) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

const requestPasswordReset = async (email) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query('SELECT id, status FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { message: 'If this email exists, an OTP has been sent.' };
    }

    const user = userResult.rows[0];
    if (user.status === 'banned') {
      const error = new Error('Account is banned');
      error.statusCode = 403;
      throw error;
    }

    const lastOtp = await client.query(`
      SELECT created_at FROM otp_verifications
      WHERE email = $1
      ORDER BY created_at DESC LIMIT 1
      `, [email]);

    if (lastOtp.rows.length > 0) {
      const lastSent = new Date(lastOtp.rows[0].created_at);
      if ((Date.now() - lastSent.getTime()) / 1000 < 60) {
        const error = new Error('OTP already sent recently. Please wait before requesting again.');
        error.statusCode = 429;
        throw error;
      }
    }

    const otp = generateOtp();
    const expireSeconds = parseInt(process.env.OTP_EXPIRY || '300');
    const expiresAt = Math.floor(Date.now() / 1000) + expireSeconds;

    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    await client.query(
      'INSERT INTO otp_verifications (email, otp, expires_at) VALUES ($1, $2, to_timestamp($3))',
      [email, otp, expiresAt]
    );

    await client.query('COMMIT');

    const { sendResetPasswordEmail } = require('../config/email');
    await sendResetPasswordEmail(email, otp);
    return { message: 'OTP sent to your email' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const verifyOtp = async (email, otp) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT id, otp, expires_at FROM otp_verifications
       WHERE email = $1
       ORDER BY created_at DESC
       LIMIT 1
      `, [email]
    );
    // console.log("!!!");
    // console.log(otp);
    // console.log(email);
    // console.table(res);
    if (res.rows.length === 0) {
      const error = new Error('Invalid or expired OTP');
      error.statusCode = 400;
      throw error;
    }
    const row = res.rows[0];

    if (!row.expires_at || new Date(row.expires_at) < new Date()) {
      const error = new Error('Invalid or expired OTP');
      error.statusCode = 400;
      throw error;
    }

    if (String(row.otp) !== String(otp)) {
      const error = new Error('Invalid or expired OTP');
      error.statusCode = 400;
      throw error;
    }

    await client.query('DELETE FROM otp_verifications WHERE email = $1', [email]);

    const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { message: 'If this email exists, an OTP has been sent.' }
    }

    const user = userRes.rows[0];
    await client.query('COMMIT');

    const resetToken = generateToken({ user_id: user.id, purpose: 'password_reset' }, { expiresIn: '15m' });
    return { message: 'OTP verified successfully', resetToken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const resetPasswordWithToken = async (resetToken, newPassword) => {
  const client = await pool.connect();
  try {
    let payload;
    try {
      payload = verifyToken(resetToken);
    } catch (err) {
      const error = new Error('Invalid or expired reset token');
      error.statusCode = 401;
      throw error;
    }

    if (!payload || payload.purpose !== 'password_reset' || !payload.user_id) {
      const error = new Error('Invalid or expired reset token');
      error.statusCode = 401;
      throw error;
    }
    const userId = payload.user_id;

    await client.query('BEGIN');

    const userRes = await client.query('SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    const currentHash = userRes.rows[0].password_hash;
    console.table(newPassword);
    const isSame = await bcrypt.compare(newPassword, currentHash);
    if (isSame) {
      const error = new Error('New password must be different from the old password');
      error.statusCode = 405;
      throw error;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);

    await client.query('COMMIT');
    return { message: 'Password has been reset successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { register, login, adminLogin, refresh, logout, sendOtp, verifyOtpAndRegister, googleLogin, requestPasswordReset, verifyOtp, resetPasswordWithToken };