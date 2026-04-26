const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Load .env
if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length) process.env[key.trim()] = values.join('=').trim();
  });
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Create tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Find already-applied versions
  const { rows } = await client.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => r.version));

  // Get all migration files sorted by name
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const version = path.basename(file, '.sql');
    if (applied.has(version)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`  apply ${file}`);
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Failed on ${file}: ${err.message}`);
    }
  }

  await client.end();
  console.log(ran === 0 ? '\nAll migrations already applied.' : `\n${ran} migration(s) applied.`);
}

migrate().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
