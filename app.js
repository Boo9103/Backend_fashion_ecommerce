require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const errorHandler = require('./utils/errorHandler');
const passport = require('./config/passport');
const cron = require('node-cron');
const promotionService = require('./services/promotionServices');
const { cleanupExpiredRefreshTokens } = require('./cleanupRefreshTokens');
const rateLimit = require('express-rate-limit');
// lấy helper để xử lý IP an toàn với IPv6
const { keyGeneratorIpFallback } = require('express-rate-limit');

const pool = require('./config/db');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.FE_URL || 'http://localhost:5000',
  credentials: true,
}));

app.use(passport.initialize());

// Routes
app.use('/api', authRoutes);
app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/public', require('./routes/publicRoutes'));
app.use('/payments', paymentsRoutes);

//rate limiter
const globalLimiter = rateLimit({
  windowMs: 60*1000, //1 phút
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Quá nhiều yêu cầu từ địa chỉ IP này, vui lòng thử lại sau một phút.'
})
app.use(globalLimiter);

const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  // nếu user đã auth thì dùng user id, ngược lại dùng helper của thư viện để lấy IP an toàn
  keyGenerator: (req) => {
    if (req.user && req.user.id) return `user:${req.user.id}`;
    return keyGeneratorIpFallback(req);
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/user', userLimiter);

// Error handling (last)
app.use(errorHandler);

cron.schedule('0 0 * * *', () => {
  // Chạy job dọn refresh token hết hạn hàng ngày lúc 00:00
  (async () => {
    try {
      const n = await cleanupExpiredRefreshTokens();
      if (typeof n === 'number') console.log(`Cleaned up ${n} expired refresh tokens`);
    } catch (err) {
      console.error('cron cleanupExpiredRefreshTokens error:', err && err.stack ? err.stack : err);
    }
  })();
}); // Chạy hàng ngày lúc 00:00

// chạy mỗi 5 phút để hết hạn khuyến mãi
cron.schedule('*/5 * * * *', async () => {
  try {
    const n = await promotionService.expirePromotions();
    if (n > 0) console.log(`Expired ${n} promotions`);
  } catch (err) {
    console.error('cron expirePromotions error:', err && err.stack ? err.stack : err);
  }
});

cron.schedule('0 */1 * * *', async () => { // mỗi giờ
  try { await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_by_week'); }
  catch (e) { console.error('refresh mv_revenue_by_week failed', e); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

