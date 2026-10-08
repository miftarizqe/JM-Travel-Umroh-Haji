#!/usr/bin/env node
// Jalankan perintah (next dev, migrate, dst.) memakai salah satu file env:
//   node scripts/with-env.mjs <local|dev|prod> <perintah> [argumen...]
// Contoh: node scripts/with-env.mjs dev next dev
//
// Next.js sendiri cuma kenal .env, .env.local, .env.development, .env.production
// (dipilih dari NODE_ENV, bukan dari server tujuan). Jadi skrip ini memuat
// .env.<nama> ke environment proses — environment proses selalu menang atas
// file .env* yang dibaca Next.js/migrate.mjs. Variabel yang ada di .env /
// .env.local tapi TIDAK ada di file target dikosongkan, supaya nilai lokal
// (mis. JWT_SECRET, DB_*) gak bocor diam-diam ke mode dev/prod.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [target, cmd, ...args] = process.argv.slice(2);
const TARGETS = ['local', 'dev', 'prod'];

if (!TARGETS.includes(target) || !cmd) {
  console.error(`Pakai: node scripts/with-env.mjs <${TARGETS.join('|')}> <perintah> [argumen...]`);
  process.exit(1);
}

function parseEnvFile(nama) {
  const envPath = path.join(rootDir, nama);
  if (!fs.existsSync(envPath)) return null;
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    const q = val[0];
    if ((q === '"' || q === "'") && val.endsWith(q) && val.length >= 2) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, '');
    env[m[1]] = val;
  }
  return env;
}

const fileTarget = `.env.${target}`;
const envTarget = parseEnvFile(fileTarget);
if (!envTarget) {
  console.error(`File ${fileTarget} belum ada. Salin dari .env.example lalu isi nilainya.`);
  process.exit(1);
}

const env = { ...process.env };
// Kosongkan variabel dari file yang otomatis dibaca Next.js tapi tidak
// didefinisikan di file target (kecuali yang sudah di-set manual di shell).
for (const nama of ['.env', '.env.local']) {
  for (const key of Object.keys(parseEnvFile(nama) || {})) {
    if (!(key in envTarget) && process.env[key] === undefined) env[key] = '';
  }
}
// Nilai yang di-set manual di shell tetap menang (sama seperti Next.js).
for (const [key, val] of Object.entries(envTarget)) {
  if (process.env[key] === undefined) env[key] = val;
}
env.APP_ENV = target;

const label = { local: 'LOKAL', dev: 'DEV (dev.jmtourtravel.com)', prod: 'PRODUKSI (jmtourtravel.com)' }[target];
console.log(`\n[with-env] Memakai ${fileTarget} → ${label} | DB ${env.DB_USER || '?'}@${env.DB_HOST || '?'}/${env.DB_NAME || '?'}`);
if (target === 'prod') {
  console.log('[with-env] ⚠️  HATI-HATI: semua perubahan data dari sini masuk ke DATABASE PRODUKSI.\n');
}

const child = spawn(cmd, args, { stdio: 'inherit', env, cwd: rootDir });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
child.on('error', (err) => {
  console.error(`[with-env] Gagal menjalankan "${cmd}":`, err.message);
  process.exit(1);
});
