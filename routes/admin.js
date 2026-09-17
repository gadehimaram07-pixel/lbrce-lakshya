const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runQuery, getOne, getAll } = require('../db');
const { verifyAdminToken, JWT_SECRET } = require('../middleware/auth');

// POST /api/admin/login - Authenticate admin and return JWT
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

// GET /api/admin/stats - High-level metrics for dashboard
router.get('/stats', verifyAdminToken, async (req, res) => {
  try {
    const totalRegsRow = await getOne('SELECT COUNT(*) as total FROM registrations');
    const uniqueStudentsRow = await getOne('SELECT COUNT(DISTINCT roll_number) as unique_students FROM registrations');
    const totalEventsRow = await getOne('SELECT COUNT(*) as total_events FROM events');

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
        r.college LIKE ?
      )`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
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
      'Registration Time'
    ];

    let csvContent = headers.join(',') + '\r\n';

    for (const r of rows) {
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
