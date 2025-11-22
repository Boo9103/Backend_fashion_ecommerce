const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, requireAdmin, requireUser } = require('../middleware/authMiddleware');
const passport = require('../config/passport');

router.post('/login', authController.login); 
router.post('/refresh', authController.refresh);
router.post('/register', authController.sendOtpController); // Gửi OTP
router.post('/verify-otp', authController.verifyOtpController); // Verify và lưu
router.post('/logout', requireUser, authController.logout);
router.post('/admin/login', authController.adminLogin);

router.post('/reset-password', authController.requestPasswordReset);//gửi otp đổi mk
router.post('/reset-password/verify', authController.verifyResetOtp); // verify OTP -> trả resetToken
router.post('/reset-password/confirm', authController.resetPassword); //dùng resettoken đổi mật khẩu

router.get('/me', (req, res) => {
    res.json({ user: req.user });
});

// trước: const googleAuth = passport.authenticate('google', { scope: ['profile', 'email'] });
// thay bằng route dynamic để inject state (session_id)
router.get('/auth/google', (req, res, next) => {
  const sessionId = req.query.session_id || req.headers['x-session-id'] || null;
  // passport will include state in callback as req.query.state
  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: sessionId || undefined
  })(req, res, next);
});
// callback route remains same path used by passport
router.get('/auth/google/callback', passport.authenticate('google', { session: false }), require('../controllers/authController').googleCallback);

router.get('/check-login', authController.checkLoginStatus);

module.exports = router;
