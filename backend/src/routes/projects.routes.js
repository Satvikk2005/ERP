const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Express 4 doesn't forward rejected promises from async handlers to the error
// middleware, so wrap each handler to turn a throw into a clean 500 response.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_STATUS = ['open', 'paused', 'closed'];

// Shared SELECT that decorates a project with its manager's name, member count,
// and the assigned member list as JSON.
const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.department, p.status,
         p.manager_id, m.name AS manager_name, m.employee_code AS manager_code,
         p.start_date, p.end_date, p.created_at, p.updated_at,
         COALESCE(mem.member_count, 0) AS member_count,
         COALESCE(mem.members, '[]'::json) AS members
  FROM projects p
  JOIN employees m ON m.id = p.manager_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS member_count,
           json_agg(json_build_object(
             'id', e.id, 'name', e.name, 'employee_code', e.employee_code,
             'department', e.department, 'job_title', e.job_title
           ) ORDER BY e.name) AS members
    FROM project_members pm
    JOIN employees e ON e.id = pm.employee_id
    WHERE pm.project_id = p.id
  ) mem ON true
`;

// GET /api/projects?department=Marketing&status=open — every project (all
// authenticated users can see the company-wide board).
router.get('/', requireAuth, wrap(async (req, res) => {
  const { department, status } = req.query;
  const clauses = [];
  const params = [];
  if (department && department !== 'all') {
    params.push(department);
    clauses.push(`p.department = $${params.length}`);
  }
  if (status && VALID_STATUS.includes(status)) {
    params.push(status);
    clauses.push(`p.status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows } = await db.query(
    `${PROJECT_SELECT} ${where} ORDER BY p.updated_at DESC`,
    params
  );
  res.json({ projects: rows });
}));

// GET /api/projects/stats — counts by status for the dashboard tiles.
// Registered before '/:id' so "stats" isn't captured as a project id.
router.get('/stats', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM projects GROUP BY status`
  );
  const stats = { open: 0, paused: 0, closed: 0, total: 0 };
  rows.forEach((r) => { stats[r.status] = r.count; stats.total += r.count; });
  res.json({ stats });
}));

// GET /api/projects/:id — one project with its members.
router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Project not found.' });
  res.json({ project: rows[0] });
}));

// POST /api/projects — any authenticated employee can start a project; whoever
// creates it becomes the project manager automatically.
router.post('/', requireAuth, wrap(async (req, res) => {
  const { name, description, department, memberIds, startDate, endDate } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required.' });
  if (!department || !department.trim()) return res.status(400).json({ error: 'Department is required.' });
  // Empty strings from the form become NULL (dates are optional).
  const start = startDate || null;
  const end = endDate || null;
  if (start && end && end < start) {
    return res.status(400).json({ error: 'Target end date cannot be before the start date.' });
  }

  const managerId = req.user.id;
  const ids = Array.isArray(memberIds)
    ? [...new Set(memberIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO projects (name, description, department, manager_id, created_by, start_date, end_date)
       VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING id`,
      [name.trim().slice(0, 200), (description || '').trim().slice(0, 4000), department.trim().slice(0, 100), managerId, start, end]
    );
    const projectId = rows[0].id;

    // Always include the manager as a member, plus everyone selected.
    const memberSet = new Set([managerId, ...ids]);
    for (const empId of memberSet) {
      await client.query(
        `INSERT INTO project_members (project_id, employee_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [projectId, empId]
      );
    }
    await client.query('COMMIT');

    const { rows: full } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [projectId]);
    res.status(201).json({ project: full[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') return res.status(400).json({ error: 'One of the selected members does not exist.' });
    throw err;
  } finally {
    client.release();
  }
}));

// PATCH /api/projects/:id/status — only the project's manager or an admin can
// change its status (open / paused / closed).
router.patch('/:id/status', requireAuth, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: 'Status must be open, paused, or closed.' });
  }
  const { rows } = await db.query('SELECT manager_id FROM projects WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Project not found.' });
  if (rows[0].manager_id !== req.user.id && req.user.accessRole !== 'admin') {
    return res.status(403).json({ error: 'Only the project manager or an admin can change the status.' });
  }
  await db.query('UPDATE projects SET status = $1, updated_at = now() WHERE id = $2', [status, req.params.id]);
  const { rows: full } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [req.params.id]);
  res.json({ project: full[0] });
}));

// PATCH /api/projects/:id/members — manager or admin: replace the member list.
router.patch('/:id/members', requireAuth, wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.memberIds)
    ? [...new Set(req.body.memberIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  const { rows } = await db.query('SELECT manager_id FROM projects WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Project not found.' });
  if (rows[0].manager_id !== req.user.id && req.user.accessRole !== 'admin') {
    return res.status(403).json({ error: 'Only the project manager or an admin can change members.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM project_members WHERE project_id = $1', [req.params.id]);
    const memberSet = new Set([rows[0].manager_id, ...ids]);
    for (const empId of memberSet) {
      await client.query(
        `INSERT INTO project_members (project_id, employee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, empId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const { rows: full } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [req.params.id]);
  res.json({ project: full[0] });
}));

module.exports = router;
