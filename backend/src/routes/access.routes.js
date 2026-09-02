const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const GRANTABLE = ['manager', 'hr', 'admin'];

// GET /api/access/mine — the caller's active temporary grant (for the banner).
router.get('/mine', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT g.granted_role, g.expires_at, g.reason, e.name AS granted_by
     FROM access_grants g LEFT JOIN employees e ON e.id = g.granted_by
     WHERE g.employee_id = $1 AND g.revoked_at IS NULL AND g.expires_at > now()
     ORDER BY g.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ grant: rows[0] || null });
}));

// GET /api/access/grants — every grant (active first). Admin only.
router.get('/grants', requireAuth, requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT g.id, g.granted_role, g.reason, g.expires_at, g.revoked_at, g.created_at,
            e.id AS employee_id, e.name AS employee_name, e.employee_code, e.department, e.access_role AS base_role,
            b.name AS granted_by
     FROM access_grants g
     JOIN employees e ON e.id = g.employee_id
     LEFT JOIN employees b ON b.id = g.granted_by
     ORDER BY (g.revoked_at IS NULL AND g.expires_at > now()) DESC, g.created_at DESC
     LIMIT 200`
  );
  const now = Date.now();
  const grants = rows.map((g) => ({
    ...g,
    active: !g.revoked_at && new Date(g.expires_at).getTime() > now,
  }));
  res.json({ grants });
}));

// POST /api/access/grants — grant temporary elevated access. Admin only.
router.post('/grants', requireAuth, requireRole('admin'), wrap(async (req, res) => {
  const { employeeId, role, expiresAt, reason } = req.body || {};
  const eid = Number(employeeId);
  if (!Number.isInteger(eid)) return res.status(400).json({ error: 'Pick an employee.' });
  if (!GRANTABLE.includes(role)) return res.status(400).json({ error: 'Choose a valid access level.' });
  if (!expiresAt) return res.status(400).json({ error: 'Set an expiry date/time.' });
  const exp = new Date(expiresAt);
  if (isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Expiry must be in the future.' });
  }
  const { rows: emp } = await db.query('SELECT id, name, employee_code FROM employees WHERE id = $1', [eid]);
  if (!emp[0]) return res.status(404).json({ error: 'Employee not found.' });

  // One active grant per employee — supersede any earlier one.
  await db.query(
    `UPDATE access_grants SET revoked_at = now()
     WHERE employee_id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [eid]
  );
  const { rows } = await db.query(
    `INSERT INTO access_grants (employee_id, granted_role, granted_by, reason, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, granted_role, expires_at`,
    [eid, role, req.user.id, (reason || '').trim().slice(0, 1000) || null, exp.toISOString()]
  );
  await db.query(
    'INSERT INTO audit_log (actor_employee_id, action, target, ip_address) VALUES ($1,$2,$3,$4)',
    [req.user.id, 'access_granted', `${emp[0].employee_code}:${role}`, req.ip]
  );
  res.status(201).json({ grant: rows[0] });
}));

// POST /api/access/grants/:id/revoke — end a grant now. Admin only.
router.post('/grants/:id/revoke', requireAuth, requireRole('admin'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE access_grants SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL RETURNING employee_id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Grant not found or already ended.' });
  await db.query(
    'INSERT INTO audit_log (actor_employee_id, action, target, ip_address) VALUES ($1,$2,$3,$4)',
    [req.user.id, 'access_revoked', String(req.params.id), req.ip]
  );
  res.json({ ok: true });
}));

module.exports = router;
