const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { publicKey, pushEnabled, sendPushToEmployees } = require('../utils/push');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/push/public-key — the VAPID public key the browser needs to subscribe.
router.get('/public-key', requireAuth, wrap(async (req, res) => {
  res.json({ key: publicKey(), enabled: pushEnabled() });
}));

// POST /api/push/subscribe — save this device's push subscription.
router.post('/subscribe', requireAuth, wrap(async (req, res) => {
  const sub = req.body && req.body.subscription;
  if (!sub || !sub.endpoint || !sub.keys) return res.status(400).json({ error: 'Invalid subscription.' });
  await db.query(
    `INSERT INTO push_subscriptions (employee_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET employee_id = EXCLUDED.employee_id,
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [req.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
  res.status(201).json({ ok: true });
}));

// POST /api/push/unsubscribe — remove a device's subscription by endpoint.
router.post('/unsubscribe', requireAuth, wrap(async (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND employee_id = $2', [endpoint, req.user.id]);
  res.json({ ok: true });
}));

// POST /api/push/test — send a test notification to the caller's devices.
router.post('/test', requireAuth, wrap(async (req, res) => {
  await sendPushToEmployees(req.user.id, {
    title: 'Accesco ERP', body: 'Notifications are on — you’ll get task and deadline alerts here.', url: '/',
  });
  res.json({ ok: true });
}));

// POST /api/push/run-deadline-check — find tasks due today/tomorrow (not done)
// and push a reminder to their assignees. Meant to be called once a day by a
// scheduler (GitHub Actions / cron-job.org). Protected by CRON_SECRET, or an
// admin token.
router.post('/run-deadline-check', wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'];
  let authorized = secret && provided && provided === secret;
  if (!authorized) {
    // Fall back to an admin JWT so an admin can trigger it manually.
    try {
      const jwt = require('jsonwebtoken');
      const hdr = req.headers.authorization || '';
      const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      const payload = tok ? jwt.verify(tok, process.env.JWT_SECRET) : null;
      authorized = payload && payload.accessRole === 'admin';
    } catch (e) { authorized = false; }
  }
  if (!authorized) return res.status(403).json({ error: 'Not authorized.' });

  // Tasks with a due date of today or tomorrow, still open, not yet reminded today.
  const { rows: tasks } = await db.query(
    `SELECT t.id, t.title, t.task_date, t.project_id, p.name AS project_name,
            (t.task_date = CURRENT_DATE) AS is_today
     FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.status <> 'done'
       AND t.task_date IN (CURRENT_DATE, CURRENT_DATE + 1)
       AND (t.deadline_notified_on IS DISTINCT FROM CURRENT_DATE)`
  );
  let sent = 0;
  for (const t of tasks) {
    const { rows: asg } = await db.query(
      `SELECT employee_id FROM task_assignees WHERE task_id = $1
       UNION SELECT assignee_id FROM tasks WHERE id = $1 AND assignee_id IS NOT NULL`,
      [t.id]
    );
    const ids = asg.map((r) => r.employee_id).filter(Boolean);
    if (ids.length) {
      await sendPushToEmployees(ids, {
        title: t.is_today ? 'Task due today' : 'Task due tomorrow',
        body: `${t.title} · ${t.project_name}`,
        url: '/',
      });
      sent += 1;
    }
    await db.query('UPDATE tasks SET deadline_notified_on = CURRENT_DATE WHERE id = $1', [t.id]);
  }
  res.json({ ok: true, tasksChecked: tasks.length, remindersSent: sent });
}));

module.exports = router;
