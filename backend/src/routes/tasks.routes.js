const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// "Above interns" = anyone who is a manager or admin. In this roster the intern
// positions all carry the 'employee' access role, so only managers/admins may
// assign tasks. The target must be an intern (job title contains "intern").
function canAssign(user) {
  return user.accessRole === 'manager' || user.accessRole === 'admin';
}

// GET /api/tasks/mine?date=YYYY-MM-DD — the caller's own tasks for a day
// (defaults to today). Used by the intern task snippet.
router.get('/mine', requireAuth, wrap(async (req, res) => {
  const date = req.query.date || todayISO();
  const { rows } = await db.query(
    `SELECT t.id, t.title, t.details, t.status, t.task_date, e.name AS assigned_by_name
     FROM tasks t LEFT JOIN employees e ON e.id = t.assigned_by
     WHERE t.intern_id = $1 AND t.task_date = $2
     ORDER BY t.created_at`,
    [req.user.id, date]
  );
  res.json({ tasks: rows, date });
}));

// GET /api/tasks?internId=&date= — manager/admin view of an intern's tasks.
router.get('/', requireAuth, wrap(async (req, res) => {
  const internId = Number(req.query.internId);
  if (!Number.isInteger(internId)) return res.status(400).json({ error: 'internId is required.' });
  // Interns may only read their own list; managers/admins may read anyone's.
  if (!canAssign(req.user) && internId !== req.user.id) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  const params = [internId];
  let dateClause = '';
  if (req.query.date) { params.push(req.query.date); dateClause = `AND t.task_date = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT t.id, t.title, t.details, t.status, t.task_date, t.assigned_by,
            e.name AS assigned_by_name
     FROM tasks t LEFT JOIN employees e ON e.id = t.assigned_by
     WHERE t.intern_id = $1 ${dateClause}
     ORDER BY t.task_date DESC, t.created_at`,
    params
  );
  res.json({ tasks: rows });
}));

// POST /api/tasks — assign a task to an intern for a given day.
router.post('/', requireAuth, wrap(async (req, res) => {
  if (!canAssign(req.user)) {
    return res.status(403).json({ error: 'Only managers and admins can assign tasks.' });
  }
  const { internId, title, details, date } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required.' });
  const id = Number(internId);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'A valid intern must be selected.' });

  const { rows: who } = await db.query(
    'SELECT id, job_title FROM employees WHERE id = $1 AND is_active = true',
    [id]
  );
  if (!who[0]) return res.status(404).json({ error: 'Employee not found.' });
  if (!/intern/i.test(who[0].job_title || '')) {
    return res.status(400).json({ error: 'Tasks can only be assigned to intern positions.' });
  }

  const { rows } = await db.query(
    `INSERT INTO tasks (intern_id, assigned_by, task_date, title, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, details, status, task_date`,
    [id, req.user.id, date || todayISO(), title.trim().slice(0, 300), (details || '').trim().slice(0, 4000)]
  );
  res.status(201).json({ task: { ...rows[0], assigned_by_name: req.user.name } });
}));

// PATCH /api/tasks/:id — mark done/pending. The intern themselves, the person
// who assigned it, or an admin may change it.
router.patch('/:id', requireAuth, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Status must be pending or done.' });
  }
  const { rows } = await db.query('SELECT intern_id, assigned_by FROM tasks WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
  const t = rows[0];
  const allowed = req.user.id === t.intern_id || req.user.id === t.assigned_by || req.user.accessRole === 'admin';
  if (!allowed) return res.status(403).json({ error: 'Not allowed to update this task.' });

  await db.query('UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2', [status, req.params.id]);
  res.json({ ok: true, status });
}));

// DELETE /api/tasks/:id — the assigner or an admin can remove a task.
router.delete('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT assigned_by FROM tasks WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
  if (req.user.id !== rows[0].assigned_by && req.user.accessRole !== 'admin') {
    return res.status(403).json({ error: 'Only the assigner or an admin can delete this task.' });
  }
  await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
