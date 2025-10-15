const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// router.post('/register', authController.register);
router.post('/login', authController.login); 
router.post('/refresh', authController.refresh);
router.post('/register', authController.sendOtpController); // Gửi OTP
router.post('/verify-otp', authController.verifyOtpController); // Verify và lưu

router.get('/me', authMiddleware, (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;