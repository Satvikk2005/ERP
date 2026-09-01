const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/leaves — any employee files a leave (single day or a period) to HR.
router.post('/', requireAuth, wrap(async (req, res) => {
  const { startDate, reason } = req.body || {};
  const endDate = req.body?.endDate || startDate;   // single day → end = start
  if (!startDate) return res.status(400).json({ error: 'A leave date is required.' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Please give a reason for your leave.' });
  if (endDate < startDate) return res.status(400).json({ error: 'The end date cannot be before the start date.' });
  const { rows } = await db.query(
    `INSERT INTO leave_requests (employee_id, start_date, end_date, reason)
     VALUES ($1,$2,$3,$4) RETURNING id, start_date, end_date, reason, created_at`,
    [req.user.id, startDate, endDate, reason.trim().slice(0, 2000)]
  );
  res.status(201).json({ leave: rows[0] });
}));

// GET /api/leaves/mine — the caller's own leave requests.
router.get('/mine', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, start_date, end_date, reason, created_at
     FROM leave_requests WHERE employee_id = $1 ORDER BY start_date DESC`,
    [req.user.id]
  );
  res.json({ leaves: rows });
}));

// GET /api/leaves?department=&employeeId= — full history (HR / admin only).
router.get('/', requireAuth, requireRole('admin', 'hr'), wrap(async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.department && req.query.department !== 'all') {
    params.push(req.query.department);
    clauses.push(`e.department = $${params.length}`);
  }
  if (req.query.employeeId) {
    params.push(Number(req.query.employeeId));
    clauses.push(`l.employee_id = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT l.id, l.start_date, l.end_date, l.reason, l.created_at,
            e.id AS employee_id, e.name AS employee_name, e.employee_code, e.department, e.job_title
     FROM leave_requests l JOIN employees e ON e.id = l.employee_id
     ${where} ORDER BY l.created_at DESC LIMIT 500`,
    params
  );
  res.json({ leaves: rows });
}));

module.exports = router;
