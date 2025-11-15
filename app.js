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

// CORS: allow FE origin, support credentials and preflight
const FE_ORIGIN = process.env.FE_URL || 'http://localhost:5000';
const corsOptions = {
  origin: (origin, callback) => {
    // allow no-origin (curl / server-to-server) or specific FE origin
    if (!origin || origin === FE_ORIGIN) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept'],
  optionsSuccessStatus: 204
};
// register preflight explicitly using '/*' instead of '*'
app.options('/*', require('cors')(corsOptions));
app.use(require('cors')(corsOptions));

// small middleware to ensure headers present for all responses (helps in some reverse-proxy cases)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (!res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', FE_ORIGIN);
  }
  next();
});

app.use(passport.initialize());

// Routes
app.use('/api', authRoutes);
app.use('/admin', adminRoutes);
app.use('/user', userRoutes);
app.use('/public', require('./routes/publicRoutes'));

// Error handling (last)
app.use(errorHandler);

// const startServerWhenDbReady = async () => {
//   const maxAttempts = Number(process.env.DB_STARTUP_RETRIES) || 5;
//   const delayMs = Number(process.env.DB_STARTUP_RETRY_DELAY_MS) || 5000;
//   let attempt = 0;
//   let ok = false;

//   while (attempt < maxAttempts && !ok) {
//     attempt++;
//     try {
//       const result = await pool.query('SELECT 1');
//       ok = result.rows.length > 0;
//       if (ok) {
//         console.log(`[startup] DB test succeeded at attempt ${attempt}`);
//         break;
//       }
//       console.error(`[startup] DB test failed (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`);
//     } catch (err) {
//       console.error(`[startup] DB test error (attempt ${attempt}):`, {
//         message: err.message,
//         stack: err.stack,
//         databaseUrl: process.env.DATABASE_URL, // Log để debug
//       });
//     }
//     await new Promise((r) => setTimeout(r, delayMs));
//   }

  // if (!ok) {
  //   console.error('[startup] Database not reachable after retries. Exiting with details:', {
  //     maxAttempts,
  //     delayMs,
  //     databaseUrl: process.env.DATABASE_URL,
  //   });
  //   process.exit(1);
  // }

  // Register cron jobs only after DB ready
  cron.schedule('0 0 * * *', async () => {
    try {
      const n = await cleanupExpiredRefreshTokens();
      if (typeof n === 'number') console.log(`Cleaned up ${n} expired refresh tokens`);
    } catch (err) {
      console.error('cron cleanupExpiredRefreshTokens error:', err.stack);
    }
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      const n = await promotionService.expirePromotions();
      if (n > 0) console.log(`Expired ${n} promotions`);
    } catch (err) {
      console.error('cron expirePromotions error:', err.stack);
    }
  });

  const PORT = process.env.PORT || 10000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
