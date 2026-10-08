// backfill-alamat-berlabel.mjs
// Susun ulang kolom flat users.alamat_ktp (& users.alamat kalau sama persis
// dengan alamat_ktp lama — domisili = KTP) jadi format berlabel "Jl. X No. Y,
// RT A/RW B, Kel. C, Kec. D, Kota, Provinsi, Negara" — sama format yang
// dipakai pendaftaran baru sejak 2026-10-06 (lib/formatAlamat.js), biar akun
// LAMA (daftar sebelum perubahan ini) ikut konsisten di SEMUA tempat yang
// nampilin alamat (admin Database Jamaah/Sahabat/Perwakilan, PDF
// formulir/PKS/perjanjian, dst) — bukan cuma di halaman Profil yang udah
// dihitung on-the-fly.
//
// Sumber data: kolom terstruktur alamat_ktp_jalan/no_rumah/rt/rw/kelurahan/
// kecamatan/kota/provinsi/negara + kode_pos (SUDAH ADA, gak diubah sama
// sekali) — script ini CUMA nyusun ulang 2 kolom TEKS turunan (alamat_ktp,
// dan alamat KALAU nilainya sama persis dengan alamat_ktp lama, tandanya
// domisili = KTP). Kalau alamat != alamat_ktp (domisili beda dari KTP),
// kolom `alamat` SENGAJA dilewati — gak ada kolom terstruktur buat domisili,
// jadi gak bisa direkonstruksi ulang dengan aman (lihat alamat_domisili,
// field terpisah yang juga gak disentuh script ini).
//
// Idempotent — aman dijalankan ulang kapan pun, hasilnya sama.
// Jalankan SEKALI dari folder project:  node scripts/one-off/backfill-alamat-berlabel.mjs
//   Tambahkan --dry-run buat lihat preview tanpa nulis ke DB.

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const dryRun = process.argv.includes('--dry-run');

const env = {};
readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const pool = await mysql.createPool({
  host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
});

function formatAlamatSatuBaris({ jalan, norumah, rt, rw, kel, kec, kota, provinsi, kp, negara }) {
  const parts = [];
  if (jalan) parts.push(`Jl. ${jalan}${norumah ? ` No. ${norumah}` : ''}`);
  if (rt || rw) parts.push(`RT ${rt || '-'}/RW ${rw || '-'}`);
  if (kel) parts.push(`Kel. ${kel}`);
  if (kec) parts.push(`Kec. ${kec}`);
  if (kota) parts.push(kota);
  if (provinsi) parts.push(kp ? `${provinsi} ${kp}` : provinsi);
  if (negara) parts.push(negara);
  return parts.join(', ');
}

const [rows] = await pool.query(
  `SELECT id, name, alamat, alamat_ktp, kode_pos,
          alamat_ktp_jalan, alamat_ktp_no_rumah, alamat_ktp_rt, alamat_ktp_rw,
          alamat_ktp_kelurahan, alamat_ktp_kecamatan, alamat_ktp_kota, alamat_ktp_provinsi, alamat_ktp_negara
   FROM users WHERE alamat_ktp_jalan IS NOT NULL AND alamat_ktp_jalan != ''`
);

console.log(`${rows.length} akun punya alamat_ktp_jalan terisi.${dryRun ? ' (--dry-run, gak nulis apa pun)' : ''}`);

let diperbaruiKtp = 0, diperbaruiJuga = 0, dilewati = 0;
for (const u of rows) {
  const baru = formatAlamatSatuBaris({
    jalan: u.alamat_ktp_jalan, norumah: u.alamat_ktp_no_rumah, rt: u.alamat_ktp_rt, rw: u.alamat_ktp_rw,
    kel: u.alamat_ktp_kelurahan, kec: u.alamat_ktp_kecamatan, kota: u.alamat_ktp_kota,
    provinsi: u.alamat_ktp_provinsi, kp: u.kode_pos, negara: u.alamat_ktp_negara,
  });
  if (!baru || baru === u.alamat_ktp) { dilewati++; continue; }

  const domisiliSamaKtp = (u.alamat || '').trim() === (u.alamat_ktp || '').trim();
  if (dryRun) {
    console.log(`- ${u.name} (${u.id})\n  LAMA: ${u.alamat_ktp}\n  BARU: ${baru}${domisiliSamaKtp ? ' (alamat ikut diupdate juga)' : ' (alamat DILEWATI — domisili beda dari KTP)'}`);
  } else if (domisiliSamaKtp) {
    await pool.query('UPDATE users SET alamat_ktp = ?, alamat = ? WHERE id = ?', [baru, baru, u.id]);
  } else {
    await pool.query('UPDATE users SET alamat_ktp = ? WHERE id = ?', [baru, u.id]);
  }
  diperbaruiKtp++;
  if (domisiliSamaKtp) diperbaruiJuga++;
}

console.log(`\nSelesai. ${diperbaruiKtp} alamat_ktp ${dryRun ? 'AKAN' : ''} diperbarui (${diperbaruiJuga} di antaranya alamat ikut diperbarui juga), ${dilewati} udah sesuai format baru / gak ada yang berubah.`);
await pool.end();
