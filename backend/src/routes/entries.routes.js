const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeBullets(bullets) {
  if (!Array.isArray(bullets)) return [];
  return bullets
    .map((b) => String(b).trim().slice(0, 500)) // hard cap length per point
    .filter(Boolean)
    .slice(0, 20); // hard cap number of points per entry
}

// POST /api/entries — create or update *today's* entry for the logged-in employee
router.post('/', requireAuth, async (req, res) => {
  const bullets = sanitizeBullets(req.body?.bullets);
  const attachmentNote = req.body?.attachmentNote ? String(req.body.attachmentNote).trim().slice(0, 255) : null;

  if (bullets.length === 0) {
    return res.status(400).json({ error: 'Add at least one update point before submitting.' });
  }

  const date = todayISO();
  const { rows } = await db.query(
    `INSERT INTO work_entries (employee_id, entry_date, bullets, attachment_note)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (employee_id, entry_date)
     DO UPDATE SET bullets = EXCLUDED.bullets, attachment_note = EXCLUDED.attachment_note, updated_at = now()
     RETURNING *`,
    [req.user.id, date, JSON.stringify(bullets), attachmentNote]
  );

  res.status(201).json({ entry: rows[0] });
});

// GET /api/entries/me?from=YYYY-MM-DD&to=YYYY-MM-DD — own history
router.get('/me', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  const clauses = ['employee_id = $1'];
  const params = [req.user.id];

  if (from) { params.push(from); clauses.push(`entry_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`entry_date <= $${params.length}`); }

  const { rows } = await db.query(
    `SELECT * FROM work_entries WHERE ${clauses.join(' AND ')} ORDER BY entry_date DESC`,
    params
  );
  res.json({ entries: rows });
});

module.exports = router;
