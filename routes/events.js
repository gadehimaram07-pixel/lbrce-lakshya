const express = require('express');
const router = express.Router();
const { getAll, getOne } = require('../db');

// Parse JSON columns (prizes, rounds, rules, coordinators) safely
const parseMeta = (ev) => {
  if (!ev) return ev;
  for (const key of ['prizes', 'rounds', 'rules', 'coordinators']) {
    if (typeof ev[key] === 'string' && ev[key]) {
      try {
        ev[key] = JSON.parse(ev[key]);
      } catch (e) {
        ev[key] = null;
      }
    } else if (!ev[key]) {
      ev[key] = key === 'prizes' ? null : [];
      if (key === 'prizes') ev[key] = null;
    }
  }
  ev.team_min = Number(ev.team_min) || 1;
  ev.team_max = Math.max(1, Number(ev.team_max) || 1);
  ev.featured = Boolean(ev.featured);
  return ev;
};

// GET /api/events - List all events with live participant counts
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
        e.*,
        COUNT(r.id) AS registered_count,
        CASE
          WHEN e.max_participants IS NULL THEN 999999
          ELSE (e.max_participants - COUNT(r.id))
        END AS spots_left,
        CASE
          WHEN e.max_participants IS NOT NULL AND COUNT(r.id) >= e.max_participants THEN 1
          ELSE 0
        END AS is_full
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id
      GROUP BY e.id
      ORDER BY e.featured DESC, e.category, e.name
    `;

    const events = (await getAll(query)).map((ev) => {
      parseMeta(ev);
      return ev;
    });
    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve events.'
    });
  }
});

// GET /api/events/:id - Get specific event details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT
        e.*,
        COUNT(r.id) AS registered_count,
        CASE
          WHEN e.max_participants IS NULL THEN 999999
          ELSE (e.max_participants - COUNT(r.id))
        END AS spots_left,
        CASE
          WHEN e.max_participants IS NOT NULL AND COUNT(r.id) >= e.max_participants THEN 1
          ELSE 0
        END AS is_full
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id
      WHERE e.id = ?
      GROUP BY e.id
    `;

    const event = await getOne(query, [id]);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found.'
      });
    }

    res.json({
      success: true,
      data: parseMeta(event)
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve event.'
    });
  }
});

module.exports = router;
