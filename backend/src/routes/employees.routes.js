const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/employees — directory (id, name, dept, role) for the "select employee"
// UI element. Available to any authenticated user (needed to render dropdowns),
// but never returns password hashes or emails to non-admins.
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, employee_code, name, department, job_title, access_role, is_active
     FROM employees ORDER BY department, name`
  );
  res.json({ employees: rows });
});

// POST /api/employees — admin only: create a new employee account.
// Generates a random temporary password and returns it ONCE so the admin
// can share it out-of-band; it is never stored or logged in plaintext.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, email, department, jobTitle, accessRole, employeeCode } = req.body || {};
  if (!name || !email || !department || !jobTitle || !employeeCode) {
    return res.status(400).json({ error: 'name, email, department, jobTitle, employeeCode are required.' });
  }
  const role = ['employee', 'manager', 'admin'].includes(accessRole) ? accessRole : 'employee';

  const tempPassword = crypto.randomBytes(9).toString('base64url'); // 12-char random string
  const hash = await bcrypt.hash(tempPassword, 12);

  try {
    const { rows } = await db.query(
      `INSERT INTO employees (employee_code, name, email, password_hash, department, job_title, access_role, must_reset_pw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       RETURNING id, employee_code, name, email, department, job_title, access_role`,
      [employeeCode, name, email.toLowerCase().trim(), hash, department, jobTitle, role]
    );
    res.status(201).json({ employee: rows[0], temporaryPassword: tempPassword });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An employee with that code or email already exists.' });
    }
    throw err;
  }
});

// POST /api/employees/:id/reset-password — admin only: force-reset someone's password.
router.post('/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(tempPassword, 12);
  const { rowCount } = await db.query(
    'UPDATE employees SET password_hash = $1, must_reset_pw = true, failed_attempts = 0, locked_until = NULL WHERE id = $2',
    [hash, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ temporaryPassword: tempPassword });
});

// PATCH /api/employees/:id/status — admin only: activate/deactivate an account
// (use this instead of deleting people when they leave the company).
router.patch('/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
  const { isActive } = req.body || {};
  const { rowCount } = await db.query('UPDATE employees SET is_active = $1 WHERE id = $2', [!!isActive, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ ok: true });
});

module.exports = router;
