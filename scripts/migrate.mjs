// Jalankan migrasi SQL yang belum diterapkan dari folder migrations/, urut sesuai nomor file.
// Usage: node scripts/migrate.mjs [--dry-run]
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const rootDir = path.resolve(import.meta.dirname, '..');
const migrationsDir = path.join(rootDir, 'migrations');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  const envPath = path.join(rootDir, '.env.local');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function main() {
  const env = loadEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  await ensureMigrationsTable(conn);

  const [rows] = await conn.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Tidak ada migrasi baru.');
    await conn.end();
    return;
  }

  for (const file of pending) {
    console.log(`${dryRun ? '[dry-run] ' : ''}Menjalankan ${file}...`);
    if (!dryRun) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
    }
  }

  console.log(`Selesai. ${pending.length} migrasi ${dryRun ? 'akan' : 'sudah'} diterapkan.`);
  await conn.end();
}

main().catch((err) => {
  console.error('Migrasi gagal:', err.message);
  process.exit(1);
});
