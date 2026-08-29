const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function projectManagerId(q, projectId) {
  const { rows } = await q.query('SELECT manager_id FROM projects WHERE id = $1', [projectId]);
  return rows[0] ? rows[0].manager_id : null;
}
async function isMember(q, projectId, empId) {
  const { rows } = await q.query(
    'SELECT 1 FROM project_members WHERE project_id = $1 AND employee_id = $2',
    [projectId, empId]
  );
  return rows.length > 0;
}
async function logActivity(q, projectId, actorId, action, detail) {
  try {
    await q.query(
      'INSERT INTO project_activity (project_id, actor_id, action, detail) VALUES ($1,$2,$3,$4)',
      [projectId, actorId, action, detail]
    );
  } catch (e) { console.error('activity log failed', e.message); }
}

// GET /api/tasks/mine — every task assigned to the caller, across all projects.
router.get('/mine', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.id, t.title, t.details, t.status, t.task_date, t.project_id,
            p.name AS project_name,
            e.name AS assigned_by_name,
            (SELECT COUNT(*)::int FROM task_submissions s WHERE s.task_id = t.id AND s.employee_id = $1) AS my_submissions
     FROM tasks t
     LEFT JOIN employees e ON e.id = t.assigned_by
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.assignee_id = $1
     ORDER BY (t.status = 'done'), t.task_date DESC NULLS LAST, t.created_at DESC`,
    [req.user.id]
  );
  res.json({ tasks: rows });
}));

// GET /api/tasks?projectId= — tasks within a project (members + managers/admins).
router.get('/', requireAuth, wrap(async (req, res) => {
  const projectId = Number(req.query.projectId);
  if (!Number.isInteger(projectId)) return res.status(400).json({ error: 'projectId is required.' });
  const priv = req.user.accessRole === 'manager' || req.user.accessRole === 'admin';
  if (!priv && !(await isMember(db, projectId, req.user.id))) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  const { rows } = await db.query(
    `SELECT t.id, t.title, t.details, t.status, t.task_date, t.assignee_id,
            a.name AS assignee_name, a.employee_code AS assignee_code,
            t.assigned_by, e.name AS assigned_by_name,
            (SELECT COUNT(*)::int FROM task_submissions s WHERE s.task_id = t.id) AS submission_count
     FROM tasks t
     LEFT JOIN employees a ON a.id = t.assignee_id
     LEFT JOIN employees e ON e.id = t.assigned_by
     WHERE t.project_id = $1
     ORDER BY (t.status = 'done'), t.created_at`,
    [projectId]
  );
  res.json({ tasks: rows });
}));

// POST /api/tasks — the project manager (or an admin) assigns a task to a member
// of that project. Members can be anyone (incl. seniors and the manager
// themselves) — rank doesn't matter, project membership does.
router.post('/', requireAuth, wrap(async (req, res) => {
  const { projectId, assigneeId, title, details, date } = req.body || {};
  const pid = Number(projectId);
  const aid = Number(assigneeId);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'A project is required.' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required.' });
  if (!Number.isInteger(aid)) return res.status(400).json({ error: 'An assignee is required.' });

  const mgr = await projectManagerId(db, pid);
  if (mgr == null) return res.status(404).json({ error: 'Project not found.' });
  if (mgr !== req.user.id && req.user.accessRole !== 'admin') {
    return res.status(403).json({ error: 'Only the project manager or an admin can assign tasks.' });
  }
  if (!(await isMember(db, pid, aid))) {
    return res.status(400).json({ error: 'You can only assign tasks to members of this project.' });
  }

  const { rows } = await db.query(
    `INSERT INTO tasks (project_id, assignee_id, assigned_by, task_date, title, details)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, title, details, status, task_date, assignee_id`,
    [pid, aid, req.user.id, date || null, title.trim().slice(0, 300), (details || '').trim().slice(0, 4000)]
  );
  const { rows: who } = await db.query('SELECT name FROM employees WHERE id = $1', [aid]);
  await logActivity(db, pid, req.user.id, 'task_assigned', `assigned "${rows[0].title}" to ${who[0] ? who[0].name : 'a member'}`);
  res.status(201).json({ task: { ...rows[0], assignee_name: who[0] ? who[0].name : null } });
}));

// POST /api/tasks/:id/submit — the assignee reports work done on the task
// (text + optional document). Also appended to their daily work entry so the
// personal report / performance scores keep reflecting activity.
router.post('/:id/submit', requireAuth, wrap(async (req, res) => {
  const { body, attachmentNote } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Describe the work you did.' });

  const { rows } = await db.query(
    `SELECT t.id, t.title, t.assignee_id, t.project_id FROM tasks t WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
  const task = rows[0];
  if (task.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only submit work on tasks assigned to you.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sub } = await client.query(
      `INSERT INTO task_submissions (task_id, employee_id, body, attachment_note)
       VALUES ($1,$2,$3,$4) RETURNING id, body, attachment_note, created_at`,
      [task.id, req.user.id, body.trim().slice(0, 4000), (attachmentNote || '').trim().slice(0, 255) || null]
    );
    // Mirror into the day's work entry (one row per person per day) so the
    // personal report and Performance scores keep working unchanged.
    const bullet = JSON.stringify([`[${task.title}] ${body.trim().slice(0, 500)}`]);
    await client.query(
      `INSERT INTO work_entries (employee_id, entry_date, bullets, attachment_note)
       VALUES ($1, CURRENT_DATE, $2::jsonb, $3)
       ON CONFLICT (employee_id, entry_date)
       DO UPDATE SET bullets = work_entries.bullets || $2::jsonb,
                     attachment_note = COALESCE(EXCLUDED.attachment_note, work_entries.attachment_note),
                     updated_at = now()`,
      [req.user.id, bullet, (attachmentNote || '').trim().slice(0, 255) || null]
    );
    await logActivity(client, task.project_id, req.user.id, 'task_submission', `submitted work on "${task.title}"`);
    await client.query('COMMIT');
    res.status(201).json({ submission: sub[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// GET /api/tasks/:id/submissions — history of submissions on a task.
router.get('/:id/submissions', requireAuth, wrap(async (req, res) => {
  const { rows: t } = await db.query('SELECT project_id, assignee_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!t[0]) return res.status(404).json({ error: 'Task not found.' });
  const priv = req.user.accessRole === 'manager' || req.user.accessRole === 'admin';
  if (!priv && t[0].assignee_id !== req.user.id && !(await isMember(db, t[0].project_id, req.user.id))) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  const { rows } = await db.query(
    `SELECT s.id, s.body, s.attachment_note, s.created_at, e.name AS author
     FROM task_submissions s LEFT JOIN employees e ON e.id = s.employee_id
     WHERE s.task_id = $1 ORDER BY s.created_at DESC`,
    [req.params.id]
  );
  res.json({ submissions: rows });
}));

// PATCH /api/tasks/:id — mark done/pending (assignee, project manager, or admin).
router.patch('/:id', requireAuth, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Status must be pending or done.' });
  }
  const { rows } = await db.query('SELECT t.assignee_id, t.project_id, p.manager_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
  const t = rows[0];
  const allowed = req.user.id === t.assignee_id || req.user.id === t.manager_id || req.user.accessRole === 'admin';
  if (!allowed) return res.status(403).json({ error: 'Not allowed to update this task.' });
  await db.query('UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2', [status, req.params.id]);
  res.json({ ok: true, status });
}));

// DELETE /api/tasks/:id — the project manager or an admin can remove a task.
router.delete('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query('SELECT t.project_id, p.manager_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
  if (req.user.id !== rows[0].manager_id && req.user.accessRole !== 'admin') {
    return res.status(403).json({ error: 'Only the project manager or an admin can delete this task.' });
  }
  await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
