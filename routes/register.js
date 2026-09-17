const express = require('express');
const router = express.Router();
const { runQuery, getOne } = require('../db');

// Helper to generate a unique readable registration pass code
const generateRegistrationId = () => {
  const timestampPart = Date.now().toString().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `LAK-${timestampPart}${randomPart}`.slice(0, 11);
};

// Email and Phone validation helpers
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone) => {
  return /^[6-9]\d{9}$/.test(phone.replace(/[\s-+]/g, ''));
};

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
      year
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

    // 5. Check duplicate registration (UNIQUE on event_id, roll_number)
    const existingRegistration = await getOne(
      'SELECT id, created_at FROM registrations WHERE event_id = ? AND UPPER(roll_number) = ?',
      [event_id, roll_number]
    );

    if (existingRegistration) {
      return res.status(409).json({
        success: false,
        message: `Roll Number "${roll_number}" is already registered for "${event.name}". Duplicate registrations are not allowed.`,
        existingId: existingRegistration.id
      });
    }

    // 6. Check event capacity
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

    // 7. Insert registration
    const regId = generateRegistrationId();
    await runQuery(
      `INSERT INTO registrations (id, event_id, name, roll_number, email, phone, college, department, year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [regId, event_id, name, roll_number, email, phone, college, department, year]
    );

    // 8. Return confirmation payload
    res.status(201).json({
      success: true,
      message: `Registration successful for ${event.name}!`,
      data: {
        registration_id: regId,
        event_id: event.id,
        event_name: event.name,
        category: event.category,
        venue: event.venue,
        date_time: event.date_time,
        fee: event.fee,
        name,
        roll_number,
        email,
        phone,
        college,
        department,
        year,
        registered_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error handling registration:', error);
    
    // SQLite constraint violation fallback check
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        message: 'A registration already exists with this Roll Number for this event.'
      });
    }

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

    res.json({
      success: true,
      data: {
        registration_id: reg.id,
        event_id: reg.event_id,
        event_name: reg.event_name,
        category: reg.event_category,
        venue: reg.venue,
        date_time: reg.date_time,
        fee: reg.fee,
        name: reg.name,
        roll_number: reg.roll_number,
        email: reg.email,
        phone: reg.phone,
        college: reg.college,
        department: reg.department,
        year: reg.year,
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

module.exports = router;

