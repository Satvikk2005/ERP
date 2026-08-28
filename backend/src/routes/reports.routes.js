const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeStats, scoreLabel } = require('../utils/scoring');

const router = express.Router();

// GET /api/reports/employees?department=Marketing — manager/admin only.
// Returns every employee with their current engagement score for the sidebar list.
router.get('/employees', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const { department } = req.query;
  const params = [];
  let where = '';
  if (department && department !== 'all') {
    params.push(department);
    where = 'WHERE e.department = $1';
  }

  // Email and access role are included so the admin-only Users directory can
  // show full contact info alongside each person's work history.
  const { rows: employees } = await db.query(
    `SELECT e.id, e.employee_code, e.name, e.department, e.job_title, e.email, e.access_role, e.is_active
     FROM employees e ${where} ORDER BY e.name`,
    params
  );

  const { rows: entries } = await db.query(
    `SELECT employee_id, entry_date, bullets, attachment_note, attachment_url FROM work_entries
     WHERE entry_date >= (CURRENT_DATE - INTERVAL '30 days')`
  );

  const byEmployee = {};
  entries.forEach((e) => {
    (byEmployee[e.employee_id] ||= []).push(e);
  });

  const result = employees.map((emp) => {
    const stats = computeStats(byEmployee[emp.id] || []);
    return { ...emp, score: stats.score, label: scoreLabel(stats.score) };
  });

  res.json({ employees: result });
});

// GET /api/reports/employees/:id?from=&to= — manager/admin only. Full history + stats.
router.get('/employees/:id', requireAuth, requireRole('manager', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;

  const { rows: empRows } = await db.query(
    'SELECT id, employee_code, name, department, job_title, email, access_role FROM employees WHERE id = $1',
    [id]
  );
  const employee = empRows[0];
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });

  // stats always computed on the trailing 30 days regardless of the display filter
  const { rows: statsEntries } = await db.query(
    `SELECT entry_date, bullets, attachment_note, attachment_url FROM work_entries
     WHERE employee_id = $1 AND entry_date >= (CURRENT_DATE - INTERVAL '30 days')`,
    [id]
  );
  const stats = computeStats(statsEntries);

  const clauses = ['employee_id = $1'];
  const params = [id];
  if (from) { params.push(from); clauses.push(`entry_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`entry_date <= $${params.length}`); }

  const { rows: history } = await db.query(
    `SELECT entry_date, bullets, attachment_note, attachment_url FROM work_entries
     WHERE ${clauses.join(' AND ')} ORDER BY entry_date DESC`,
    params
  );

  await db.query(
    'INSERT INTO audit_log (actor_employee_id, action, target, ip_address) VALUES ($1,$2,$3,$4)',
    [req.user.id, 'report_view', employee.employee_code, req.ip]
  );

  res.json({ employee, stats: { ...stats, label: scoreLabel(stats.score) }, history });
});

module.exports = router;
