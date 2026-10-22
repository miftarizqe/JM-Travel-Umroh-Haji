#!/usr/bin/env node
// Repo ini FRONTEND saja (sejak 2026-10-22). Semua backend — route API, akses database, migrasi,
// job terjadwal — ada di repo jm-travel-api. Skrip ini dijalankan otomatis sebelum `npm run build`
// (prebuild, termasuk build Docker saat deploy): build GAGAL kalau ada kode backend yang masuk lagi
// ke repo ini, mis. lewat merge branch lama. Di dev/prod Caddy mengirim /api/* ke backend, jadi
// route API di repo ini tidak akan pernah jalan — perubahan diam-diam tidak berlaku.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temuan = [];

function jelajah(dir, cek) {
  if (!fs.existsSync(dir)) return;
  for (const nama of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nama.name);
    if (nama.isDirectory()) jelajah(p, cek);
    else cek(p);
  }
}

const rel = p => path.relative(root, p);
if (fs.existsSync(path.join(root, 'src/app/api'))) temuan.push('src/app/api/ (route API)');
if (fs.existsSync(path.join(root, 'migrations'))) temuan.push('migrations/ (migrasi DB)');
if (fs.existsSync(path.join(root, 'src/instrumentation.js'))) temuan.push('src/instrumentation.js (job terjadwal)');
// Route handler di luar /api (mis. src/app/uploads/[...path]/route.js) juga backend.
jelajah(path.join(root, 'src/app'), p => {
  if (/^route\.(js|jsx|ts|tsx|mjs)$/.test(path.basename(p)) && !rel(p).startsWith('src/app/api')) temuan.push(rel(p));
});
// Akses database / rahasia server dari kode FE.
const POLA = [/from\s+['"]mysql2/, /from\s+['"]bcryptjs/, /from\s+['"]jsonwebtoken/, /from\s+['"]@\/lib\/db['"]/];
jelajah(path.join(root, 'src'), p => {
  if (!/\.(js|jsx|ts|tsx|mjs)$/.test(p)) return;
  const isi = fs.readFileSync(p, 'utf8');
  if (POLA.some(re => re.test(isi))) temuan.push(`${rel(p)} (import database/JWT/bcrypt)`);
});

if (temuan.length > 0) {
  console.error('\n✖ Kode backend ditemukan di repo frontend (jm-travel-web):');
  for (const t of temuan) console.error(`   - ${t}`);
  console.error('\n  Backend (route API, migrasi, akses DB) WAJIB dibuat di repo jm-travel-api.');
  console.error('  Pindahkan perubahannya ke sana, lalu hapus dari repo ini. Lihat AGENTS.md.\n');
  process.exit(1);
}
console.log('✓ cek-tanpa-backend: repo frontend bersih dari kode backend');
