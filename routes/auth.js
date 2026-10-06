const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { runQuery, getOne, getAll } = require('../db');
const { sendOtpMail } = require('../utils/mailer');
const { JWT_SECRET } = require('../middleware/auth');

const OTP_TTL_MS = 5 * 60 * 1000;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// POST /api/auth/request-otp — generate OTP and email it (used at login / before registration)
router.post('/request-otp', async (req, res) => {
  try {
    let { email, purpose } = req.body;
    email = (email || '').trim().toLowerCase();
    purpose = (purpose || 'login').trim().slice(0, 20);

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const otp = genOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Invalidate previous unconsumed OTPs for this email+purpose
    await runQuery(`UPDATE otps SET consumed = 1 WHERE email = ? AND purpose = ? AND consumed = 0`, [email, purpose]);
    await runQuery(
      `INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, ?, ?)`,
      [email, otp, purpose, expiresAt]
    );

    const mail = await sendOtpMail(email, otp, purpose);

    const payload = {
      success: true,
      message: mail.sent
        ? `OTP sent to ${email}. Valid for 5 minutes — check your inbox and spam folder.`
        : `Could not deliver mail to ${email} right now. Please try again in a minute.`,
      mailSent: mail.sent
    };
    if (!mail.sent) {
      return res.status(502).json({ ...payload, success: false });
    }
    res.json(payload);
  } catch (err) {
    console.error('request-otp error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate OTP. Please try again.' });
  }
});

// POST /api/auth/verify-otp — verify OTP, return short-lived email token
router.post('/verify-otp', async (req, res) => {
  try {
    let { email, otp, purpose } = req.body;
    email = (email || '').trim().toLowerCase();
    otp = (otp || '').trim();
    purpose = (purpose || 'login').trim().slice(0, 20);

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const row = await getOne(
      `SELECT * FROM otps WHERE email = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1`,
      [email, purpose]
    );

    if (!row) {
      return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await runQuery(`UPDATE otps SET consumed = 1 WHERE id = ?`, [row.id]);
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    if (Number(row.attempts) >= 5) {
      await runQuery(`UPDATE otps SET consumed = 1 WHERE id = ?`, [row.id]);
      return res.status(429).json({ success: false, message: 'Too many wrong attempts. Request a fresh OTP.' });
    }

    if (row.otp !== otp) {
      await runQuery(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
      return res.status(400).json({ success: false, message: 'Incorrect OTP. Please check and try again.' });
    }

    await runQuery(`UPDATE otps SET consumed = 1 WHERE id = ?`, [row.id]);

    // Issue a 30-min email-verified token the client attaches during event registration
    const emailToken = jwt.sign({ email, purpose, verified: true }, JWT_SECRET, { expiresIn: '30m' });

    res.json({
      success: true,
      message: `Email ${email} verified successfully.`,
      email,
      emailToken
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify OTP.' });
  }
});

module.exports = router;
