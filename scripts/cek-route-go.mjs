#!/usr/bin/env node
// Guard: route API Next.js yang path-nya dilayani jm-travel-api (Go) TIDAK BOLEH ada.
//
// Di dev & prod, Caddy (jm-travel-api/deploy/caddy/Caddyfile.tahap2) mengirim path di matcher
// @go / @go_programs ke Go, jadi route Next.js di path itu tidak pernah jalan. Kalau masih ada,
// orang mengedit kode mati dan perubahannya diam-diam tidak berlaku (2026-10-20: field referral
// agen ditambah di src/app/api/profil/route.js, padahal /api/profil dilayani Go).
//
//   node scripts/cek-route-go.mjs [--caddyfile <path>] [--wajib]
//
// Caddyfile dicari di --caddyfile, env CADDYFILE_GO, lalu repo jm-travel-api di sebelah repo ini.
// Tanpa --wajib, Caddyfile yang tidak ketemu cuma peringatan (laptop tanpa repo api).
// Dipanggil auto-deploy.sh (repo api) sebelum container web baru naik: gagal = deploy batal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wajib = args.includes('--wajib');
const iCf = args.indexOf('--caddyfile');

const kandidat = [
  iCf >= 0 ? args[iCf + 1] : null,
  process.env.CADDYFILE_GO,
  path.join(rootDir, '..', 'jm-travel-api', 'deploy', 'caddy', 'Caddyfile.tahap2'),
].filter(Boolean);
const caddyfile = kandidat.find(f => fs.existsSync(f));
if (!caddyfile) {
  const pesan = `Caddyfile Go tidak ditemukan (dicoba: ${kandidat.join(', ')})`;
  if (wajib) { console.error(`GAGAL: ${pesan}`); process.exit(1); }
  console.warn(`PERINGATAN: ${pesan} — cek dilewati. Set CADDYFILE_GO buat mengecek.`);
  process.exit(0);
}
const cf = fs.readFileSync(caddyfile, 'utf8');

// Matcher yang di-`handle` ke upstream Go ({args[0]} di snippet jm_app).
const keGo = new Set();
for (const m of cf.matchAll(/handle\s+@([\w-]+)\s*\{\s*reverse_proxy\s+\{args\[0\]\}/g)) keGo.add(m[1]);

const matcher = [];
for (const m of cf.matchAll(/@([\w-]+)\s*\{([\s\S]*?)\n\s*\}/g)) {
  if (!keGo.has(m[1])) continue;
  const paths = [];
  let methods = null;
  for (const raw of m[2].split('\n')) {
    const baris = raw.replace(/#.*/, '').trim().split(/\s+/);
    if (baris[0] === 'path') paths.push(...baris.slice(1));
    if (baris[0] === 'method') methods = baris.slice(1).map(s => s.toUpperCase());
  }
  if (paths.length) matcher.push({ nama: m[1], paths, methods }); // blok `handle @x {` tidak punya path
}
if (!matcher.length) {
  console.error(`GAGAL: tidak ada matcher @go yang terbaca di ${caddyfile} — format Caddyfile berubah? Perbarui skrip ini.`);
  process.exit(1);
}

// Pola Caddy: `*` cocok dengan apa saja (termasuk `/`), tidak peka huruf besar/kecil.
const cocok = (pola, url) =>
  new RegExp('^' + pola.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(url);

// Handler method yang di-proxy ke Go untuk `next dev` lokal boleh tetap ada: `export const GET = teruskanKeGo;`
const exportMethod = (isi, method) =>
  new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=(?!\\s*teruskanKeGo\\b)`).test(isi);

const pelanggaran = [];
const apiDir = path.join(rootDir, 'src', 'app', 'api');
(function jelajah(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { jelajah(p); continue; }
    if (!/^route\.(js|jsx|ts|tsx|mjs)$/.test(e.name)) continue;
    const url = '/' + path.relative(path.join(rootDir, 'src', 'app'), dir).split(path.sep).join('/')
      .replace(/\[\[?\.\.\.[^\]]+\]\]?/g, 'X/Y')
      .replace(/\[[^\]]+\]/g, 'X');
    const rel = path.relative(rootDir, p);
    for (const { nama, paths, methods } of matcher) {
      const pola = paths.find(pl => cocok(pl, url));
      if (!pola) continue;
      if (!methods) { pelanggaran.push(`${rel}  (${url} -> @${nama} ${pola})`); break; }
      const isi = fs.readFileSync(p, 'utf8');
      const kena = methods.filter(md => exportMethod(isi, md));
      if (kena.length) pelanggaran.push(`${rel}  (${kena.join('/')} ${url} -> @${nama} ${pola})`);
    }
  }
})(apiDir);

if (pelanggaran.length) {
  console.error(`GAGAL: ${pelanggaran.length} route Next.js berada di path yang dilayani Go (${caddyfile}):`);
  for (const v of pelanggaran) console.error(`  - ${v}`);
  console.error('Kode ini tidak pernah jalan di dev/prod. Hapus route-nya; perubahan backend dibuat di jm-travel-api (lihat AGENTS.md).');
  process.exit(1);
}
console.log(`OK: tidak ada route Next.js di path Go (${matcher.map(m => '@' + m.nama).join(', ')}, ${caddyfile})`);
