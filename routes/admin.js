const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runQuery, getOne, getAll } = require('../db');
const { verifyAdminToken, JWT_SECRET } = require('../middleware/auth');

// POST /api/admin/login - Authenticate admin (password + optional email OTP step)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const admin = await getOne('SELECT * FROM admins WHERE username = ?', [username.trim()]);
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    // If ADMIN_EMAIL is configured, require OTP second factor sent to mail
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const otpEnabled = Boolean(adminEmail) && process.env.ADMIN_OTP_ENABLED !== 'false';

    if (otpEnabled) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await runQuery(`UPDATE otps SET consumed = 1 WHERE email = ? AND purpose = 'admin' AND consumed = 0`, [adminEmail]);
      await runQuery(`INSERT INTO otps (email, otp, purpose, expires_at) VALUES (?, ?, 'admin', ?)`, [adminEmail, otp, expiresAt]);
      const { sendOtpMail } = require('../utils/mailer');
      const mail = await sendOtpMail(adminEmail, otp, 'admin');
      if (!mail.sent) {
        return res.status(502).json({
          success: false,
          message: `Password is correct, but the OTP mail could not be delivered to ${adminEmail}. Check SMTP settings and try again.`
        });
      }
      return res.json({
        success: true,
        otpRequired: true,
        message: `Password verified. OTP sent to ${adminEmail} — check inbox and spam.`,
        adminEmailMasked: adminEmail.replace(/(^.).*(@.*$)/, '$1***$2')
      });
    }

    // Sign JWT (valid for 24 hours)
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Admin authentication successful.',
      token,
      username: admin.username
    });
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
});

// POST /api/admin/verify-otp - Complete admin login with emailed OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { username, otp } = req.body;
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!username || !otp) {
      return res.status(400).json({ success: false, message: 'Username and OTP are required.' });
    }
    const row = await getOne(
      `SELECT * FROM otps WHERE email = ? AND purpose = 'admin' AND consumed = 0 ORDER BY id DESC LIMIT 1`,
      [adminEmail]
    );
    if (!row) return res.status(400).json({ success: false, message: 'No OTP found. Please login again.' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await runQuery(`UPDATE otps SET consumed = 1 WHERE id = ?`, [row.id]);
      return res.status(400).json({ success: false, message: 'OTP expired. Please login again.' });
    }
    if (row.otp !== String(otp).trim()) {
      await runQuery(`UPDATE otps SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
      return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
    }
    await runQuery(`UPDATE otps SET consumed = 1 WHERE id = ?`, [row.id]);
    const admin = await getOne('SELECT * FROM admins WHERE username = ?', [String(username).trim()]);
    if (!admin) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, message: 'Admin authentication successful.', token, username: admin.username });
  } catch (error) {
    console.error('Error in admin verify-otp:', error);
    res.status(500).json({ success: false, message: 'Server error during OTP verification.' });
  }
});

// GET /api/admin/stats - High-level metrics for dashboard
router.get('/stats', verifyAdminToken, async (req, res) => {
  try {
    const totalRegsRow = await getOne('SELECT COUNT(*) as total FROM registrations');
    const uniqueStudentsRow = await getOne('SELECT COUNT(DISTINCT roll_number) as unique_students FROM registrations');
    const totalEventsRow = await getOne('SELECT COUNT(*) as total_events FROM events');
    const revenueRow = await getOne(`
      SELECT COALESCE(SUM(amount_paid), 0) as total_revenue 
      FROM registrations 
      WHERE payment_status IN ('SUCCESS', 'PAID')
    `);

    // Event-wise counts
    const eventStats = await getAll(`
      SELECT 
        e.id, 
        e.name, 
        e.category, 
        e.department,
        e.max_participants,
        COUNT(r.id) as registered_count
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id
      GROUP BY e.id
      ORDER BY registered_count DESC
    `);

    // Department breakdown
    const departmentStats = await getAll(`
      SELECT 
        department, 
        COUNT(*) as count 
      FROM registrations 
      GROUP BY department 
      ORDER BY count DESC
    `);

    // Year breakdown
    const yearStats = await getAll(`
      SELECT 
        year, 
        COUNT(*) as count 
      FROM registrations 
      GROUP BY year 
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: {
        totalRegistrations: totalRegsRow.total || 0,
        uniqueStudents: uniqueStudentsRow.unique_students || 0,
        totalEvents: totalEventsRow.total_events || 0,
        totalRevenue: revenueRow ? revenueRow.total_revenue : 0,
        eventStats,
        departmentStats,
        yearStats
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve metrics.'
    });
  }
});

// GET /api/admin/registrations - Search, filter, and view registrations
router.get('/registrations', verifyAdminToken, async (req, res) => {
  try {
    const { event_id, department, search, limit = 100, page = 1 } = req.query;

    let conditions = [];
    let params = [];

    if (event_id && event_id !== 'all') {
      conditions.push('r.event_id = ?');
      params.push(event_id);
    }

    if (department && department !== 'all') {
      conditions.push('r.department = ?');
      params.push(department);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(`(
        r.name LIKE ? OR 
        r.roll_number LIKE ? OR 
        r.email LIKE ? OR 
        r.phone LIKE ? OR 
        r.id LIKE ? OR
        r.college LIKE ? OR
        r.transaction_id LIKE ? OR
        r.team_name LIKE ? OR
        r.members LIKE ?
      )`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total matching count
    const countSql = `
      SELECT COUNT(*) as total 
      FROM registrations r 
      JOIN events e ON r.event_id = e.id
      ${whereClause}
    `;
    const totalRow = await getOne(countSql, params);

    // Get paginated records
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const sql = `
      SELECT 
        r.*, 
        e.name as event_name, 
        e.category as event_category
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const records = await getAll(sql, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      total: totalRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: records
    });
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve registrations.'
    });
  }
});

// Helper function to safely escape CSV values
const escapeCSV = (val) => {
  if (val === null || val === undefined) return '""';
  const stringVal = String(val).replace(/"/g, '""');
  return `"${stringVal}"`;
};

// GET /api/admin/export - Export registrations as CSV
router.get('/export', verifyAdminToken, async (req, res) => {
  try {
    const { event_id } = req.query;
    let sql = `
      SELECT 
        r.id as pass_code,
        e.name as event_name,
        e.category as event_category,
        r.name as student_name,
        r.roll_number,
        r.email,
        r.phone,
        r.college,
        r.department,
        r.year,
        r.team_name,
        r.members,
        r.payment_status,
        r.payment_method,
        r.amount_paid,
        r.transaction_id,
        r.created_at
      FROM registrations r
      JOIN events e ON r.event_id = e.id
    `;
    let params = [];

    if (event_id && event_id !== 'all') {
      sql += ' WHERE r.event_id = ?';
      params.push(event_id);
    }

    sql += ' ORDER BY e.name, r.created_at ASC';

    const rows = await getAll(sql, params);

    const headers = [
      'Pass ID',
      'Event Name',
      'Category',
      'Student Name',
      'Roll Number',
      'Email',
      'Phone Number',
      'College',
      'Department',
      'Year of Study',
      'Team Name',
      'Team Size',
      'Team Members (name|roll|email|phone)',
      'Payment Status',
      'Payment Method',
      'Amount Paid (INR)',
      'Transaction / UTR ID',
      'Registration Time'
    ];

    let csvContent = headers.join(',') + '\r\n';

    for (const r of rows) {
      let teamMembers = [];
      try { teamMembers = JSON.parse(r.members || '[]'); } catch (e) { teamMembers = []; }
      const line = [
        escapeCSV(r.pass_code),
        escapeCSV(r.event_name),
        escapeCSV(r.event_category),
        escapeCSV(r.student_name),
        escapeCSV(r.roll_number),
        escapeCSV(r.email),
        escapeCSV(r.phone),
        escapeCSV(r.college),
        escapeCSV(r.department),
        escapeCSV(r.year),
        escapeCSV(r.team_name || ''),
        escapeCSV(1 + teamMembers.length),
        escapeCSV(teamMembers.map((m) => `${m.name}|${m.roll_number}|${m.email}|${m.phone}`).join('; ')),
        escapeCSV(r.payment_status || 'SUCCESS'),
        escapeCSV(r.payment_method || 'UPI'),
        escapeCSV(r.amount_paid !== undefined ? r.amount_paid : 0),
        escapeCSV(r.transaction_id || 'N/A'),
        escapeCSV(r.created_at)
      ].join(',');
      csvContent += line + '\r\n';
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lakshya-registrations-${timestamp}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error exporting registrations to CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export registrations.'
    });
  }
});

// DELETE /api/admin/registrations/:id - Delete a registration (e.g. invalid or test entry)
router.delete('/registrations/:id', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getOne('SELECT id, name, roll_number FROM registrations WHERE id = ?', [id]);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Registration record not found.'
      });
    }

    await runQuery('DELETE FROM registrations WHERE id = ?', [id]);

    res.json({
      success: true,
      message: `Registration ${id} (${existing.name} - ${existing.roll_number}) successfully removed.`
    });
  } catch (error) {
    console.error('Error deleting registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete registration.'
    });
  }
});

module.exports = router;
