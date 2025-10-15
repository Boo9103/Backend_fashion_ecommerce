const authService = require('../services/authService');
const pool = require('../config/db');

const register = async (req, res, next) => {
    try {
        const {email, password, full_name, phone} = req.body;

        //Kiểm tra đầu vào
        if(!email || !password || !full_name) {
            return res.status(400).json({ error: 'Missing required fields'});
        }
        const user = await authService.register({ email, password, full_name, phone});
        res.status(201).json(user);
    }catch(error){
        next(error);
    }
};

const login = async (req, res, next)=>{
    try{
        const {email, password} = req.body;
        if(!email || !password){
            return res.status(400).json({ error: 'Missing email or password'});
        }
        const result = await authService.login({email, password});
        res.status(200).json(result); //Trả về {token, user}
    }catch (error){
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try{
        const { refreshToken } = req.body;
        if(!refreshToken){
            return res.status(400).json({ error: 'Missing refresh token'});
        }
        const result = await authService.refresh(refreshToken);
        res.status(200).json(result); // { "accessToken": "new_jwt" }
    }catch(error){
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

module.exports = { register, login, refresh, sendOtpController, verifyOtpController };

