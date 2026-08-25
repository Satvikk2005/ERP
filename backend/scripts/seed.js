require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');

// Roster pulled from the original WorkTrack prototype. Update the `email`
// generation logic below to match your real company email domain before
// running this in production.
const EMPLOYEES = [
  { code: 'EMP-001', name: "Argha Sengupta", dept: "Founder's Office", role: 'CEO', accessRole: 'admin' },
  { code: 'EMP-002', name: 'Ayushman Saha', dept: "Founder's Office", role: 'CBDO', accessRole: 'manager' },
  { code: 'EMP-003', name: 'Md. Asif', dept: "Founder's Office", role: 'COO', accessRole: 'manager' },
  { code: 'EMP-004', name: 'Archita Roy', dept: "Founder's Office", role: 'CBO', accessRole: 'manager' },
  { code: 'EMP-005', name: 'Janhavi Kar', dept: "Founder's Office", role: 'CMO', accessRole: 'manager' },
  { code: 'EMP-006', name: 'Adrisha Saha', dept: "Founder's Office", role: 'Social Media Head', accessRole: 'manager' },
  { code: 'EMP-007', name: 'Nitish Bhagat', dept: "Founder's Office", role: 'CXO', accessRole: 'manager' },
  { code: 'EMP-008', name: 'Md Nabil Qamar', dept: "Founder's Office", role: 'Vice Secretary', accessRole: 'manager' },
  { code: 'EMP-009', name: 'Piyush Das', dept: "Founder's Office", role: 'Vice President', accessRole: 'manager' },
  { code: 'EMP-010', name: 'Shatakshi', dept: 'HR', role: 'HR intern' },
  { code: 'EMP-011', name: 'Priyanshu', dept: 'HR', role: 'HR intern' },
  { code: 'EMP-012', name: 'Kavina', dept: 'HR', role: 'HR intern' },
  { code: 'EMP-013', name: 'Shreyasi', dept: 'HR', role: 'HR intern' },
  { code: 'EMP-014', name: 'Thaseem', dept: 'HR', role: 'HR intern' },
  { code: 'EMP-015', name: 'Shrishti', dept: 'HR', role: 'HR intern' },
  { code: 'EMP-016', name: 'Rahul', dept: 'AI/ML', role: 'AIML Intern' },
  { code: 'EMP-017', name: 'Jai Jain', dept: 'AI/ML', role: 'AI/ML Intern' },
  { code: 'EMP-018', name: 'Syon Duke Abraham', dept: 'AI/ML', role: 'AI/ML Intern' },
  { code: 'EMP-019', name: 'Bharath Sai', dept: 'AI/ML', role: 'AI/ML intern' },
  { code: 'EMP-020', name: 'Ravi Vinayak', dept: 'AI/ML', role: 'AI/ML intern' },
  { code: 'EMP-021', name: 'Deepanshu Tevathiya', dept: 'AI/ML', role: 'AI/ML Intern' },
  { code: 'EMP-022', name: 'Amit kumar singh', dept: 'AI/ML', role: 'AI/ML Intern' },
  { code: 'EMP-023', name: 'Vinayak Maurya', dept: 'AI/ML', role: 'AI/ML Intern' },
  { code: 'EMP-024', name: 'GUNJI UDAY NARAYANA', dept: 'AI/ML', role: 'AI/ML Intern' },
  { code: 'EMP-025', name: 'Shakti Prasad Muduli', dept: 'Security', role: 'Penetration Engineer Intern' },
  { code: 'EMP-026', name: 'Arman Kumar', dept: 'Security', role: 'Penetration Engineer Intern' },
  { code: 'EMP-027', name: 'Apurv Kumar', dept: 'Security', role: 'SOC Analyst intern' },
  { code: 'EMP-028', name: 'khushi Bajaj', dept: 'Security', role: 'Soc analyst (intern)' },
  { code: 'EMP-029', name: 'Smahi Jhang', dept: 'Design', role: 'Product Design Intern' },
  { code: 'EMP-030', name: 'Sanjay R', dept: 'Design', role: 'MUIUX Designer Intern' },
  { code: 'EMP-031', name: 'Shruti Kumari', dept: 'Design', role: 'UI/UX Designer Intern' },
  { code: 'EMP-032', name: 'Muhammad Alam Raza Bharmar', dept: 'Design', role: 'UI/UX Designer Intern' },
  { code: 'EMP-033', name: 'Patnayukuni.Vinod', dept: 'Design', role: 'UI/UX Designer Intern' },
  { code: 'EMP-034', name: 'Dindi Basanth', dept: 'CRM', role: 'CRM Executive Intern' },
  { code: 'EMP-035', name: 'Jatan', dept: 'CRM', role: 'CRM Executive Intern' },
  { code: 'EMP-036', name: 'Kashif', dept: 'CRM', role: 'CRM Executive Intern' },
  { code: 'EMP-037', name: 'Sanskriti', dept: 'R&D & Analytics', role: 'R&D Intern' },
  { code: 'EMP-038', name: 'Shivam', dept: 'R&D & Analytics', role: 'R&D Intern' },
  { code: 'EMP-039', name: 'Manasvi', dept: 'R&D & Analytics', role: 'Business Analytics Intern' },
  { code: 'EMP-040', name: 'Gunjan', dept: 'Marketing', role: 'Marketing and Outreach Intern' },
  { code: 'EMP-041', name: 'Ramya Pathak', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-042', name: 'Reedham', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-043', name: 'Tanmay', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-044', name: 'Saanjh', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-045', name: 'Rishab', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-046', name: 'Devjit', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-047', name: 'Venessa', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-048', name: 'Sakshi', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-049', name: 'Jatin', dept: 'Marketing', role: 'Marketing Associate Intern' },
  { code: 'EMP-050', name: 'Sohini', dept: 'Marketing', role: 'Digital Marketing Intern' },
  { code: 'EMP-051', name: 'Rasmita', dept: 'Marketing', role: 'Digital Marketing Intern' },
  { code: 'EMP-052', name: 'Sridevi', dept: 'Marketing', role: 'Digital Marketing Intern' },
  { code: 'EMP-053', name: 'Rshiraj', dept: 'Marketing', role: 'Digital Marketing Intern' },
  { code: 'EMP-054', name: 'Dhara Arora', dept: 'Marketing', role: 'Digital Marketing Intern' },
  { code: 'EMP-055', name: 'Rama Gaur', dept: 'Marketing', role: 'Digital Marketing Intern' },
  { code: 'EMP-056', name: 'Arohon', dept: 'Marketing', role: 'Digital Marketing Intern' },
];

const EMAIL_DOMAIN = process.env.SEED_EMAIL_DOMAIN || 'yourcompany.com';

function slugEmail(name, code) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return `${slug || code.toLowerCase()}@${EMAIL_DOMAIN}`;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });

  const credentials = []; // { code, name, email, password } — written to a local file, never logged in DB

  console.log(`Seeding ${EMPLOYEES.length} employees with placeholder emails @${EMAIL_DOMAIN} ...`);
  console.log('IMPORTANT: set SEED_EMAIL_DOMAIN in .env to your real company domain first, or correct emails afterwards.\n');

  for (const emp of EMPLOYEES) {
    const email = slugEmail(emp.name, emp.code);
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 12);

    await pool.query(
      `INSERT INTO employees (employee_code, name, email, password_hash, department, job_title, access_role, must_reset_pw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (employee_code) DO NOTHING`,
      [emp.code, emp.name, email, hash, emp.dept, emp.role, emp.accessRole || 'employee']
    );

    credentials.push({ code: emp.code, name: emp.name, email, password: tempPassword });
  }

  const outPath = path.join(__dirname, '..', 'seeded-credentials.csv');
  const csv = ['employee_code,name,email,temporary_password']
    .concat(credentials.map((c) => `${c.code},"${c.name}",${c.email},${c.password}`))
    .join('\n');
  fs.writeFileSync(outPath, csv);

  console.log(`Done. Temporary passwords written to: ${outPath}`);
  console.log('Distribute these to employees over a secure channel, then DELETE this file.');
  console.log('Every account has must_reset_pw = true, so they will be forced to set their own password on first login.');

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
