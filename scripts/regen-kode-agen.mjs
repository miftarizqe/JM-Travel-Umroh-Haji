// Jalankan SEKALI (bukan bagian dari migrate.mjs) — ganti kode_unik akun
// role='agen' lama (format nomor urut AGN0001 dst) ke slug nama
// (dikonfirmasi user 2026-10-19: link referral lebih gampang diinget/
// dipercaya dibanding nomor generik). Idempotent: akun yang udah
// kode_unik-nya BUKAN pola AGN#### (berarti udah pernah dijalankan atau
// akun baru yang lahir lewat skema nama) dilewati.
// Usage: node scripts/regen-kode-agen.mjs
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const rootDir = path.resolve(import.meta.dirname, '..');

function loadEnv() {
  const env = {};
  for (const nama of ['.env', '.env.local']) {
    const envPath = path.join(rootDir, nama);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  for (const k of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  return env;
}

function slugDariNama(nama) {
  return String(nama || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 16) || 'agen';
}

async function kodeUnikDariNama(conn, nama) {
  const base = slugDariNama(nama);
  let kandidat = base;
  for (let n = 2; ; n++) {
    const [rows] = await conn.query('SELECT 1 FROM users WHERE kode_unik = ? LIMIT 1', [kandidat]);
    if (rows.length === 0) return kandidat;
    const suffix = `-${n}`;
    kandidat = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }
}

async function main() {
  const env = loadEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const [rows] = await conn.query(
    "SELECT id, name, kode_unik FROM users WHERE role = 'agen' AND kode_unik REGEXP '^AGN[0-9]+$'"
  );
  if (rows.length === 0) {
    console.log('Tidak ada akun agen dengan kode_unik format lama (AGN####). Tidak ada yang diubah.');
    await conn.end();
    return;
  }

  for (const r of rows) {
    const kodeBaru = await kodeUnikDariNama(conn, r.name);
    await conn.query('UPDATE users SET kode_unik = ? WHERE id = ?', [kodeBaru, r.id]);
    console.log(`${r.name}: ${r.kode_unik} -> ${kodeBaru}`);
  }

  console.log(`Selesai. ${rows.length} akun agen diperbarui.`);
  await conn.end();
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
