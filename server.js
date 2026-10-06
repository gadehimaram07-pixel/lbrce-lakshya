require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDB } = require('./db');
const eventsRouter = require('./routes/events');
const registerRouter = require('./routes/register');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');
const paymentsRouter = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers with relaxed CSP for CDN stylesheets/icons
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Rate Limiter (tune via env — fest WiFi NATs many students behind few IPs)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP address, please try again in a few minutes.'
  }
});
app.use('/api/', generalLimiter);

// Specific Rate Limiter for Registrations (tune via env for fest-day rush)
const registrationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REGISTER_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'You have made too many registration attempts. Please wait a few minutes before trying again.'
  }
});

// Specific Rate Limiter for Admin Login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

// Specific Rate Limiter for OTP (tune via env)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_OTP_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait a few minutes.'
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    fest: 'LBRCE Lakshya - College Event Registration Portal',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/events', eventsRouter);
app.use('/api/register', registrationLimiter, registerRouter);
app.use('/api/auth', otpLimiter, authRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin/login', loginLimiter);
app.use('/api/admin', adminRouter);

// Login is the starting page; main portal lives at /home (guarded client-side)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Admin route alias to public/admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found.'
  });
});

// Fallback to login (starting page) for unknown frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred.'
  });
});

// Initialize database and start listening
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` LBRCE Lakshya Portal Server running on port ${PORT}`);
    console.log(` Login (start here): http://localhost:${PORT}/`);
    console.log(` Student Portal:     http://localhost:${PORT}/home`);
    console.log(` Admin Portal:       http://localhost:${PORT}/admin`);
    console.log(` Razorpay payments:  ${process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? 'ENABLED (live keys)' : 'disabled — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET for live checkout'}`);
    console.log(` Email (OTP+mails):  ${process.env.SMTP_HOST && process.env.SMTP_USER ? 'configured' : 'NOT configured — OTP login requires SMTP_HOST/SMTP_USER/SMTP_PASS'}`);
    console.log(` Default Admin:   username: "${process.env.ADMIN_USERNAME || 'admin'}", password: "${process.env.ADMIN_PASSWORD || 'Lakshya@2026'}"`);
    console.log(`====================================================`);
  });
});
