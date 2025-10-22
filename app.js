require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const errorHandler = require('./utils/errorHandler');
const passport = require('./config/passport');
const cron = require('node-cron');


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

// Error handling (last)
app.use(errorHandler);

cron.schedule('0 0 * * *', () => {
  require('./scripts/cleanupRefreshTokens');
}); // Chạy hàng ngày lúc 00:00

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

