// Sync SATU ARAH: Google Sheets -> tabel dokumen_pasal. Admin edit teks
// pasal di Sheet (lebih nyaman buat teks legal panjang dibanding textarea di
// /admin/pengaturan/dokumen), lalu klik "Sync dari Google Sheets" di sana —
// itu manggil syncPasalDariSheet() di sini. BUKAN dua arah — app gak pernah
// nulis balik ke Sheet, jadi gak ada resiko bentrok edit bersamaan.
//
// Kolom Sheet (baris 1 = header, diabaikan): dokumen | nomor | judul | isi
// `tipe` SENGAJA gak ada kolomnya di Sheet — dihitung otomatis dari
// `dokumen`, sama persis tipeDefaultUntuk() di
// src/app/api/admin/pasal/route.js & src/app/admin/pengaturan/dokumen/page.jsx
// (JANGAN beda sendiri, kalau logic itu berubah ubah juga yang di sini).
//
// Dokumen yang SAMA SEKALI gak muncul di Sheet TIDAK disentuh (tetap pakai
// isi lama di DB, biasanya diedit manual lewat /admin/pengaturan/dokumen) —
// jadi Sheet ini boleh cuma isi sebagian dokumen (mis. cuma spk_ak/sk_cif/
// surat_pemblokiran Sahabat Baitullah), gak wajib semua 6 jenis dokumen.
import { google } from 'googleapis';
import pool from '@/lib/db';

const DOKUMEN_VALID = ['spka_ins', 'jamaah', 'spk_ak', 'sk_cif', 'surat_pemblokiran', 'spk_ak_nonis'];

function tipeDefaultUntuk(dokumen) {
  return (dokumen === 'sk_cif' || dokumen === 'surat_pemblokiran') ? 'isian' : 'pasal';
}

function ambilSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Private key JSON service account biasanya ditaruh di env sebagai 1 baris
  // dengan literal "\n" — harus dikembalikan jadi newline asli dulu. Service
  // account ini SAMA dengan yang dipakai src/lib/googleDocsMerge.js (1 akun,
  // beberapa scope API — Sheets di sini, Docs+Drive di sana).
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !privateKey) {
    throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY belum diisi di env.'), { status: 400 });
  }
  const auth = new google.auth.JWT(email, null, privateKey, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  return google.sheets({ version: 'v4', auth });
}

/** @returns {Promise<{ringkasan: Array<{dokumen:string, jumlah:number}>}>} */
export async function syncPasalDariSheet() {
  const sheetId = process.env.PASAL_GOOGLE_SHEET_ID;
  if (!sheetId) throw Object.assign(new Error('PASAL_GOOGLE_SHEET_ID belum diisi di env.'), { status: 400 });

  const sheets = ambilSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A2:D' });
  const rows = res.data.values || [];

  const perDokumen = new Map();
  const errors = [];
  rows.forEach((row, i) => {
    const [dokumen, nomorRaw, judul, isi] = row;
    const baris = i + 2; // nomor baris asli di Sheet (baris 1 = header) buat pesan error
    if (!dokumen && !nomorRaw && !judul && !isi) return; // baris kosong, lewati
    if (!DOKUMEN_VALID.includes(dokumen)) { errors.push(`Baris ${baris}: dokumen "${dokumen}" tidak dikenal`); return; }
    const nomor = parseInt(nomorRaw, 10);
    if (!nomor || !judul?.trim() || !isi?.trim()) { errors.push(`Baris ${baris}: kolom nomor/judul/isi ada yang kosong`); return; }
    if (!perDokumen.has(dokumen)) perDokumen.set(dokumen, []);
    perDokumen.get(dokumen).push({ nomor, judul: judul.trim(), isi: isi.trim() });
  });

  if (errors.length) {
    throw Object.assign(new Error(`Sheet ada baris bermasalah, TIDAK ADA yang disimpan:\n${errors.join('\n')}`), { status: 400 });
  }

  for (const [dokumen, daftarPasal] of perDokumen) {
    const nomorSet = new Set();
    for (const p of daftarPasal) {
      if (nomorSet.has(p.nomor)) {
        throw Object.assign(new Error(`Dokumen "${dokumen}" punya nomor ${p.nomor} dobel di Sheet — perbaiki dulu.`), { status: 400 });
      }
      nomorSet.add(p.nomor);
    }
  }

  const conn = await pool.getConnection();
  const ringkasan = [];
  try {
    await conn.beginTransaction();
    for (const [dokumen, daftarPasal] of perDokumen) {
      await conn.query('DELETE FROM dokumen_pasal WHERE dokumen = ?', [dokumen]);
      for (const p of daftarPasal) {
        await conn.query(
          'INSERT INTO dokumen_pasal (dokumen, nomor, tipe, judul, isi) VALUES (?, ?, ?, ?, ?)',
          [dokumen, p.nomor, tipeDefaultUntuk(dokumen), p.judul, p.isi]
        );
      }
      ringkasan.push({ dokumen, jumlah: daftarPasal.length });
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { ringkasan };
}
