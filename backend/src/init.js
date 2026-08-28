const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

// Runs every .sql file in migrations/ in filename order. All migrations use
// CREATE TABLE IF NOT EXISTS / idempotent statements, so this is safe to run
// on every boot.
async function runMigrations() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query(sql);
    console.log(`migration applied: ${file}`);
  }
}

// Guarantees a bootstrap admin account exists so the app is usable on a fresh
// database. Credentials come from env (with sensible defaults) and the password
// is upserted so it always matches what's configured.
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'satvikk@rush.local').toLowerCase().trim();
  const name = process.env.ADMIN_NAME || 'Satvikk';
  const password = process.env.ADMIN_PASSWORD || '2005';
  const code = process.env.ADMIN_CODE || 'ADMIN-001';
  const hash = await bcrypt.hash(password, 12);

  await db.query(
    `INSERT INTO employees (employee_code, name, email, password_hash, department, job_title, access_role, must_reset_pw)
     VALUES ($1, $2, $3, $4, 'Administration', 'System Administrator', 'admin', false)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           access_role   = 'admin',
           is_active     = true,
           must_reset_pw = false,
           updated_at    = now()`,
    [code, name, email, hash]
  );
  console.log(`admin ensured: ${name} <${email}>`);
}

async function initDb() {
  await runMigrations();
  await ensureAdmin();
}

module.exports = { initDb, runMigrations, ensureAdmin };
