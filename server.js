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

// Global Rate Limiter: 300 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP address, please try again in a few minutes.'
  }
});
app.use('/api/', generalLimiter);

// Specific Rate Limiter for Registrations: 20 submits per 10 minutes per IP
const registrationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
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
app.use('/api/admin/login', loginLimiter);
app.use('/api/admin', adminRouter);

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

// Fallback to index.html for unknown frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    console.log(` Student Portal:  http://localhost:${PORT}`);
    console.log(` Admin Portal:    http://localhost:${PORT}/admin`);
    console.log(` Default Admin:   username: "${process.env.ADMIN_USERNAME || 'admin'}", password: "${process.env.ADMIN_PASSWORD || 'Lakshya@2026'}"`);
    console.log(`====================================================`);
  });
});
