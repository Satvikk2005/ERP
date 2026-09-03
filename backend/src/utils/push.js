const webpush = require('web-push');
const db = require('../db');

// Web Push is only active when VAPID keys are configured (env). Without them the
// helpers no-op, so the app runs fine before keys are set on the server.
const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@accescoliving.com';
const enabled = !!(PUBLIC && PRIVATE);
if (enabled) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE); }
  catch (e) { console.error('VAPID setup failed:', e.message); }
}

function pushEnabled() { return enabled; }
function publicKey() { return PUBLIC; }

// Send a notification to every device an employee has subscribed. Dead
// subscriptions (410/404) are deleted. Fire-and-forget: never throws.
async function sendPushToEmployees(employeeIds, payload) {
  if (!enabled) return;
  const ids = [...new Set((Array.isArray(employeeIds) ? employeeIds : [employeeIds]).filter(Boolean))];
  if (!ids.length) return;
  let subs = [];
  try {
    ({ rows: subs } = await db.query(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE employee_id = ANY($1)',
      [ids]
    ));
  } catch (e) { return; }
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        try { await db.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]); } catch (e) {}
      } else {
        console.error('push send failed:', err.statusCode || err.message);
      }
    }
  }));
}

module.exports = { pushEnabled, publicKey, sendPushToEmployees };
