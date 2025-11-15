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
const { cleanupExpiredRefreshTokens } = require('./cleanupRefreshTokens');

const pool = require('./config/db'); // <-- add pool import

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
app.use('/health', require('./routes/healthRoutes'));

// Error handling (last)
app.use(errorHandler);

// Start-up: ensure DB is reachable before scheduling cron jobs or listening
const startServerWhenDbReady = async () => {
  const maxAttempts = Number(process.env.DB_STARTUP_RETRIES) || 5;
  const delayMs = Number(process.env.DB_STARTUP_RETRY_DELAY_MS) || 5000;
  let attempt = 0;
  let ok = false;
  while (attempt < maxAttempts && !ok) {
    attempt++;
    try {
      const result = await pool.query('SELECT 1');
      ok = result.rows.length > 0;
      if (ok) break;
      console.error(`[startup] DB test failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`);
    } catch (err) {
      console.error(`[startup] DB test error (attempt ${attempt}):`, err && err.stack ? err.stack : err);
    }
    await new Promise(r => setTimeout(r, delayMs));
  }

  if (!ok) {
    console.error('[startup] Database not reachable after retries. Exiting.');
    process.exit(1);
  }

  // register cron jobs only after DB ready
  cron.schedule('0 0 * * *', () => {
    (async () => {
      try {
        const n = await cleanupExpiredRefreshTokens();
        if (typeof n === 'number') console.log(`Cleaned up ${n} expired refresh tokens`);
      } catch (err) {
        console.error('cron cleanupExpiredRefreshTokens error:', err && err.stack ? err.stack : err);
      }
    })();
  });

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
};

startServerWhenDbReady().catch(err => {
  console.error('[startup] fatal error:', err && err.stack ? err.stack : err);
  process.exit(1);
});

