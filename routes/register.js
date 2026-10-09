const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { runQuery, getOne, getAll } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { paymentQr, entryQr, generateEntryToken } = require('../utils/qrcode');
const { sendRegistrationMail } = require('../utils/mailer');

// Helper to generate a unique readable registration pass code (crypto-strong, collision-proof)
const crypto = require('crypto');
const generateRegistrationId = () => {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `LAK-${Date.now().toString().slice(-4)}${rand}`.slice(0, 12);
};

// Email and Phone validation helpers
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone) => {
  return /^[6-9]\d{9}$/.test(phone.replace(/[\s-+]/g, ''));
};

// GET /api/register/payment-qr?event_id=xxx — server-generated UPI QR (no external dependency)
router.get('/payment-qr', async (req, res) => {
  try {
    const { event_id } = req.query;
    if (!event_id) {
      return res.status(400).json({ success: false, message: 'event_id is required.' });
    }
    const event = await getOne('SELECT * FROM events WHERE id = ?', [event_id.trim()]);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    const fee = Number(event.fee) || 0;
    const { upiString, qrDataUrl, upiId } = await paymentQr(fee, event.name);
    res.json({
      success: true,
      data: {
        event_id: event.id,
        event_name: event.name,
        amount: fee,
        upiId,
        upiString,
        qrDataUrl
      }
    });
  } catch (err) {
    console.error('payment-qr error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate payment QR.' });
  }
});

// POST /api/register - Register a student for an event
router.post('/', async (req, res) => {
  try {
    let {
      event_id,
      name,
      roll_number,
      email,
      phone,
      college,
      department,
      year,
      payment_method,
      transaction_id,
      team_name,
      members
    } = req.body;

    // 1. Basic sanitization
    event_id = (event_id || '').trim();
    name = (name || '').trim();
    roll_number = (roll_number || '').trim().toUpperCase();
    email = (email || '').trim().toLowerCase();
    phone = (phone || '').replace(/[\s-+]/g, '');
    college = (college || 'Lakireddy Bali Reddy College of Engineering (LBRCE)').trim();
    department = (department || '').trim();
    year = (year || '').trim();
    payment_method = (payment_method || 'UPI').trim().toUpperCase();
    transaction_id = (transaction_id || '').trim().toUpperCase();
    team_name = (team_name || '').trim().slice(0, 80);
    if (!Array.isArray(members)) members = [];

    // 2. Field presence checks
    if (!event_id || !name || !roll_number || !email || !phone || !department || !year) {
      return res.status(400).json({
        success: false,
        message: 'Please fill out all required fields (Event, Name, Roll Number, Email, Phone, Department, Year).'
      });
    }

    // 3. Format validations
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number.'
      });
    }

    if (roll_number.length < 4 || roll_number.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid college roll number / student ID.'
      });
    }

    // 4. Check if event exists
    const event = await getOne('SELECT * FROM events WHERE id = ?', [event_id]);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Selected event not found. Please choose an active event.'
      });
    }
    const teamMin = Math.max(1, Number(event.team_min) || 1);
    const teamMax = Math.max(1, Number(event.team_max) || 1);

    // 4b. Team validation (demo-style team entries; lead + members)
    const cleanMembers = [];
    const seenRolls = new Set([roll_number]);
    for (let i = 0; i < members.length; i++) {
      const m = members[i] || {};
      const mName = (m.name || '').trim();
      const mRoll = (m.roll_number || '').trim().toUpperCase();
      const mEmail = (m.email || '').trim().toLowerCase();
      const mPhone = (m.phone || '').replace(/[\s-+]/g, '');
      if (!mName || !mRoll || !mEmail || !mPhone) {
        return res.status(400).json({
          success: false,
          message: `Team member ${i + 1}: name, roll number, email and phone are all required.`
        });
      }
      if (mRoll.length < 4 || mRoll.length > 20) {
        return res.status(400).json({ success: false, message: `Team member ${i + 1}: invalid roll number.` });
      }
      if (!isValidEmail(mEmail)) {
        return res.status(400).json({ success: false, message: `Team member ${i + 1}: invalid email address.` });
      }
      if (!isValidPhone(mPhone)) {
        return res.status(400).json({ success: false, message: `Team member ${i + 1}: invalid 10-digit mobile number.` });
      }
      if (seenRolls.has(mRoll)) {
        return res.status(400).json({ success: false, message: `Team member ${i + 1}: duplicate roll number within the team.` });
      }
      seenRolls.add(mRoll);
      cleanMembers.push({ name: mName, roll_number: mRoll, email: mEmail, phone: mPhone });
    }
    const teamSize = 1 + cleanMembers.length;
    if (teamSize < teamMin || teamSize > teamMax) {
      return res.status(400).json({
        success: false,
        message: teamMax === 1
          ? `"${event.name}" is an individual event — team members are not allowed.`
          : `"${event.name}" allows ${teamMin}–${teamMax} members per entry (you have ${teamSize}).`
      });
    }
    if (teamMax > 1 && cleanMembers.length > 0 && !team_name) {
      team_name = `${name.split(' ')[0]}'s Team`;
    }

    // 5. Payment validation (if event has a fee)
    const eventFee = Number(event.fee) || 0;
    if (payment_method === 'RAZORPAY') {
      // Online Razorpay payments must carry a server-verified payment token
      const { readPaymentToken } = require('../utils/razorpay');
      const decoded = readPaymentToken(req.body.payment_token, event_id, eventFee);
      if (!decoded) {
        return res.status(400).json({
          success: false,
          message: 'Razorpay payment could not be verified. Please complete the payment again.'
        });
      }
      transaction_id = String(decoded.payment_id).toUpperCase();
    } else if (eventFee > 0) {
      if (!transaction_id) {
        return res.status(400).json({
          success: false,
          message: `Payment is required to register for "${event.name}" (Fee: ₹${eventFee}). Please complete the payment and enter the UPI UTR or Transaction ID.`
        });
      }
      if (transaction_id.length < 4) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid Transaction / UTR ID (at least 4 characters).'
        });
      }
    } else {
      // Event fee is 0 (Free / ₹0 UPI payment)
      if (!transaction_id) {
        transaction_id = payment_method === 'UPI' ? `UPI-FREE-${Date.now().toString().slice(-6)}` : 'FREE-ENTRY';
      }
      if (!payment_method) {
        payment_method = 'UPI';
      }
    }

    // 6. Check duplicate registration (lead + every team member)
    const eventRegs = await getAll('SELECT id, roll_number, members FROM registrations WHERE event_id = ?', [event_id]);
    const rollToId = new Map();
    for (const er of eventRegs) {
      rollToId.set(String(er.roll_number).toUpperCase(), er.id);
      try {
        const mm = JSON.parse(er.members || '[]');
        for (const m of mm) {
          if (m && m.roll_number) rollToId.set(String(m.roll_number).toUpperCase(), er.id);
        }
      } catch (e) { /* ignore malformed members JSON */ }
    }
    for (const r of [roll_number, ...cleanMembers.map((m) => m.roll_number)]) {
      if (rollToId.has(r)) {
        console.warn(`[register] duplicate blocked: ${r} already in ${event_id} (${rollToId.get(r)})`);
        return res.status(409).json({
          success: false,
          message: `Roll Number "${r}" is already registered for "${event.name}". Duplicate registrations are not allowed.`,
          existingId: rollToId.get(r)
        });
      }
    }

    // 7. Check event capacity
    if (event.max_participants) {
      const currentCount = await getOne(
        'SELECT COUNT(*) as count FROM registrations WHERE event_id = ?',
        [event_id]
      );

      if (currentCount.count >= event.max_participants) {
        return res.status(400).json({
          success: false,
          message: `Sorry! Registration for "${event.name}" is completely full (Capacity: ${event.max_participants}).`
        });
      }
    }

    // 8. Insert registration with payment details + entry token
    let regId = generateRegistrationId();
    const entryToken = generateEntryToken();

    // Optional email OTP verification: if client sends emailToken, validate it matches email
    let emailVerified = 0;
    const emailTokenRaw = req.body.email_token || req.headers['x-email-token'];
    if (emailTokenRaw) {
      try {
        const decoded = jwt.verify(emailTokenRaw, JWT_SECRET);
        if (decoded && decoded.verified && decoded.email === email) {
          emailVerified = 1;
        }
      } catch (e) {
        // invalid token — do not block registration, just mark unverified
      }
    }

    await runQuery(
      `INSERT INTO registrations (id, event_id, name, roll_number, email, phone, college, department, year, payment_status, payment_method, transaction_id, amount_paid, entry_token, email_verified, team_name, members)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [regId, event_id, name, roll_number, email, phone, college, department, year, 'SUCCESS', payment_method, transaction_id, eventFee, entryToken, emailVerified, team_name || null, JSON.stringify(cleanMembers)]
    ).catch(async (e) => {
      // Rare pass-ID collision under heavy concurrency (NOT a duplicate signup) → retry once with a fresh ID
      if (e.message && e.message.includes('UNIQUE constraint failed: registrations.id')) {
        console.warn(`[register] pass-ID collision for ${regId}, retrying with fresh ID`);
        const retryId = generateRegistrationId();
        await runQuery(
          `INSERT INTO registrations (id, event_id, name, roll_number, email, phone, college, department, year, payment_status, payment_method, transaction_id, amount_paid, entry_token, email_verified, team_name, members)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [retryId, event_id, name, roll_number, email, phone, college, department, year, 'SUCCESS', payment_method, transaction_id, eventFee, entryToken, emailVerified, team_name || null, JSON.stringify(cleanMembers)]
        );
        regId = retryId;
        return;
      }
      throw e;
    });

    // 9. Generate entry-token QR + send confirmation email with pass + token
    const entryPayload = `LAKSHYA2026|${regId}|${entryToken}|${event_id}|${roll_number}`;
    let entryQrDataUrl = '';
    try {
      const qr = await entryQr(entryPayload);
      entryQrDataUrl = qr.qrDataUrl;
    } catch (e) {
      console.error('entry QR generation failed:', e.message);
    }

    const confirmData = {
      registration_id: regId,
      entry_token: entryToken,
      event_id: event.id,
      event_name: event.name,
      category: event.category,
      venue: event.venue,
      date_time: event.date_time,
      fee: eventFee,
      amount_paid: eventFee,
      payment_status: 'SUCCESS',
      payment_method,
      transaction_id,
      name,
      roll_number,
      email,
      phone,
      college,
      department,
      year,
      team_name: team_name || null,
      members: cleanMembers,
      team_size: teamSize,
      registered_at: new Date().toISOString()
    };

    // Fire-and-forget email (don't fail registration if SMTP fails)
    let mailSent = false;
    try {
      const mailRes = await sendRegistrationMail(email, confirmData, entryQrDataUrl);
      mailSent = !!mailRes.sent;
    } catch (e) {
      console.error('registration email failed:', e.message);
    }

    // 10. Return confirmation payload
    res.status(201).json({
      success: true,
      message: mailSent
        ? `Registration & payment successful for ${event.name}! Pass + entry token sent to ${email}.`
        : `Registration & payment successful for ${event.name}!`,
      mailSent,
      data: {
        ...confirmData,
        entryQrDataUrl,
        entryQrText: entryPayload
      }
    });
  } catch (error) {
    // Expected duplicate rejections are already answered with 409 above;
    // only log unexpected failures (UNIQUE here means a genuine race loser).
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      console.warn('[register] duplicate insert blocked:', error.message.split('UNIQUE constraint failed:')[1].trim());
      return res.status(409).json({
        success: false,
        message: 'A registration already exists with this Roll Number for this event.'
      });
    }
    console.error('Error handling registration:', error);

    res.status(500).json({
      success: false,
      message: 'Server error occurred while processing registration. Please try again.'
    });
  }
});

// GET /api/register/lookup - Allow a student to retrieve their pass card using roll number and event
router.get('/lookup', async (req, res) => {
  try {
    const { event_id, roll_number } = req.query;

    if (!event_id || !roll_number) {
      return res.status(400).json({
        success: false,
        message: 'Event and Roll Number are required to look up your pass.'
      });
    }

    const reg = await getOne(
      `SELECT r.*, e.name as event_name, e.category as event_category, e.venue, e.date_time, e.fee
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       WHERE r.event_id = ? AND UPPER(r.roll_number) = UPPER(?)`,
      [event_id.trim(), roll_number.trim()]
    );

    if (!reg) {
      return res.status(404).json({
        success: false,
        message: `No registration found for Roll Number "${roll_number.trim().toUpperCase()}" under this event.`
      });
    }

    // Backfill entry token for legacy rows without one
    let entryToken = reg.entry_token;
    if (!entryToken) {
      entryToken = generateEntryToken();
      try {
        await runQuery(`UPDATE registrations SET entry_token = ? WHERE id = ?`, [entryToken, reg.id]);
      } catch (e) { /* ignore */ }
    }
    const entryText = `LAKSHYA2026|${reg.id}|${entryToken}|${reg.event_id}|${reg.roll_number}`;
    let entryQrDataUrl = '';
    try {
      const qr = await entryQr(entryText);
      entryQrDataUrl = qr.qrDataUrl;
    } catch (e) { /* ignore */ }

    let lookupMembers = [];
    try { lookupMembers = JSON.parse(reg.members || '[]'); } catch (e) { lookupMembers = []; }
    res.json({
      success: true,
      data: {
        registration_id: reg.id,
        entry_token: entryToken,
        entryQrDataUrl,
        entryQrText: entryText,
        event_id: reg.event_id,
        event_name: reg.event_name,
        category: reg.event_category,
        venue: reg.venue,
        date_time: reg.date_time,
        fee: reg.fee,
        amount_paid: reg.amount_paid !== undefined && reg.amount_paid !== null ? reg.amount_paid : reg.fee,
        payment_status: reg.payment_status || 'SUCCESS',
        payment_method: reg.payment_method || 'UPI',
        transaction_id: reg.transaction_id || 'N/A',
        name: reg.name,
        roll_number: reg.roll_number,
        email: reg.email,
        phone: reg.phone,
        college: reg.college,
        department: reg.department,
        year: reg.year,
        team_name: reg.team_name || null,
        members: lookupMembers,
        team_size: 1 + lookupMembers.length,
        email_verified: !!reg.email_verified,
        registered_at: reg.created_at
      }
    });
  } catch (error) {
    console.error('Error looking up registration pass:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to look up registration pass.'
    });
  }
});

// POST /api/register/resend-pass — re-mail the pass + entry token to the student email
router.post('/resend-pass', async (req, res) => {
  try {
    const event_id = (req.body.event_id || '').trim();
    const roll_number = (req.body.roll_number || '').trim();
    if (!event_id || !roll_number) {
      return res.status(400).json({ success: false, message: 'event_id and roll_number are required.' });
    }
    const reg = await getOne(
      `SELECT r.*, e.name as event_name, e.category as event_category, e.venue, e.date_time, e.fee
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       WHERE r.event_id = ? AND UPPER(r.roll_number) = UPPER(?)`,
      [event_id, roll_number]
    );
    if (!reg) {
      return res.status(404).json({ success: false, message: 'No registration found for these details.' });
    }
    let members = [];
    try { members = JSON.parse(reg.members || '[]'); } catch (e) { members = []; }
    const entryText = `LAKSHYA2026|${reg.id}|${reg.entry_token || reg.id}|${reg.event_id}|${reg.roll_number}`;
    let entryQrDataUrl = '';
    try { entryQrDataUrl = (await entryQr(entryText)).qrDataUrl; } catch (e) { /* ignore */ }
    const data = {
      registration_id: reg.id,
      entry_token: reg.entry_token,
      event_id: reg.event_id,
      event_name: reg.event_name,
      category: reg.event_category,
      venue: reg.venue,
      date_time: reg.date_time,
      fee: reg.fee,
      amount_paid: reg.amount_paid ?? reg.fee,
      payment_status: reg.payment_status || 'SUCCESS',
      payment_method: reg.payment_method || 'UPI',
      transaction_id: reg.transaction_id || 'N/A',
      name: reg.name,
      roll_number: reg.roll_number,
      email: reg.email,
      phone: reg.phone,
      college: reg.college,
      department: reg.department,
      year: reg.year,
      team_name: reg.team_name || null,
      members,
      registered_at: reg.created_at
    };
    const mail = await sendRegistrationMail(reg.email, data, entryQrDataUrl);
    if (!mail.sent) {
      return res.json({
        success: true,
        mailSent: false,
        message: `Pass ID: ${reg.id} retrieved! (Email delivery unavailable on Render free tier SMTP). Please save/screenshot your pass.`
      });
    }
    res.json({ success: true, message: `Pass re-sent to ${reg.email}. Check inbox and spam.` });
  } catch (err) {
    console.error('resend-pass error:', err);
    res.status(500).json({ success: false, message: 'Failed to re-send pass email.' });
  }
});

module.exports = router;

