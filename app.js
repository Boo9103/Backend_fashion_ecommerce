require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const errorHandler = require('./utils/errorHandler');
const passport = require('./config/passport');
const cron = require('node-cron');
const promotionService = require('./services/promotionServices');


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

// Error handling (last)
app.use(errorHandler);

cron.schedule('0 0 * * *', () => {
  require('./scripts/cleanupRefreshTokens');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

