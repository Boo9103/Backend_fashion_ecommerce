const authService = require('../services/authService');
const pool = require('../config/db');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');


const register = async (req, res, next) => {
  try {
    const { email, password, full_name, phone } = req.body;

    //Kiểm tra đầu vào
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const user = await authService.register({ email, password, full_name, phone });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    const result = await authService.login({ email, password });
    res.status(200).json(result); //Trả về {token, user}
  } catch (error) {
    next(error);
  }
};

const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    const result = await authService.adminLogin({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Missing refresh token' });
    }
    const result = await authService.refresh(refreshToken);
    res.status(200).json(result); // { "accessToken": "new_jwt" }
  } catch (error) {
    next(error);
  }
};

const sendOtpController = async (req, res, next) => {
  try {
    const { email, password, full_name, phone } = req.body; // Lưu tạm nếu cần, nhưng ở đây chỉ cần email cho OTP
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // Kiểm tra email tồn tại trước (từ register logic)
    const client = await pool.connect();
    try {
      const checkEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    } finally {
      client.release();
    }

    const result = await authService.sendOtp(email);
    res.status(200).json(result); // {message: "OTP sent"}
  } catch (error) {
    next(error);
  }
};

const verifyOtpController = async (req, res, next) => {
  try {
    const { email, otp, password, full_name, phone } = req.body;
    if (!email || !otp || !password || !full_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const user = await authService.verifyOtpAndRegister({ email, otp, password, full_name, phone });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Mising refresh token' });
    }
    await authService.logout(refreshToken);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

const googleAuth = passport.authenticate('google', { scope: ['profile', 'email'] });

const googleCallback = async (req, res, next) => {
  try {
    if (!req.user) {
      console.error('googleCallback: missing req.user');
      return res.redirect(`${process.env.FE_URL || 'http://localhost:5000'}/callback?status=error`);
    }

    const user = req.user;
    const result = await authService.googleLogin(user); // { accessToken, refreshToken, user }
    if (!result || !result.accessToken) {
      console.error('googleCallback: invalid result from googleLogin', result);
      return res.redirect(`${process.env.FE_URL || 'http://localhost:5000'}/callback?status=error`);
    }

    const FE = (process.env.FE_URL || 'http://localhost:5000').replace(/\/+$/, '');

    if (process.env.NODE_ENV === 'production') {
      res.cookie('accessToken', result.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 60 * 60 * 1000,
      });
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.redirect(`${FE}/callback?status=success`);
    }

    // development: add tokens in query (ONLY dev)
    const params = new URLSearchParams({
      status: 'success',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    }).toString();

    return res.redirect(`${FE}/callback?${params}`);
  } catch (error) {
    console.error('googleCallback error:', error);
    return res.redirect(`${(process.env.FE_URL || 'http://localhost:5000').replace(/\/+$/, '')}/callback?status=error`);
  }
};

const checkLoginStatus = (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];// Lấy token sau "Bearer "
    if (!token) {
      return res.status(200).json({ loggedIn: false, user: null });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({
      loggedIn: true,
      user: {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email || null, // Thêm email nếu có trong payload
        full_name: decoded.full_name || null // thêm nếu có
      }
    });
  } catch (error) {
    return res.status(200).json({ loggedIn: false, user: null });
  }
};


const requestPasswordReset = async (req, res, next) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ error: 'Tài khoản chưa tồn tại' });
    }
    const result = await authService.requestPasswordReset(email);
    res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

const verifyResetOtp = async (req, res, next) => {
  const { email, otp, newPassword } = req.body;

  try {
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await authService.verifyOtpAndResetPassword({ email, otp, newPassword });
    res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, adminLogin, refresh, sendOtpController, verifyOtpController, logout, googleAuth, googleCallback, checkLoginStatus, requestPasswordReset, verifyResetOtp};
