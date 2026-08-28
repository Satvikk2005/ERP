require('dotenv').config();
const { initDb } = require('../src/init');

async function main() {
  console.log('Applying all migrations and ensuring bootstrap admin ...');
  await initDb();
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
