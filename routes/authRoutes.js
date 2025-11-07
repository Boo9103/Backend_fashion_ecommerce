const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, requireAdmin } = require('../middleware/authMiddleware');
const passport = require('../config/passport');

// debug: kiểm tra handlers trước khi dùng
// console.log('authController:', authController);
// console.log('typeof authController.login =', typeof authController.login);

router.post('/login', authController.login); 
router.post('/refresh', authController.refresh);
router.post('/register', authController.sendOtpController); // Gửi OTP
router.post('/verify-otp', authController.verifyOtpController); // Verify và lưu
router.post('/logout', authMiddleware, authController.logout);
router.post('/admin/login', authController.adminLogin);

router.get('/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
});

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  authController.googleCallback
);

router.get('/check-login',authMiddleware, authController.checkLoginStatus);

module.exports = router;
