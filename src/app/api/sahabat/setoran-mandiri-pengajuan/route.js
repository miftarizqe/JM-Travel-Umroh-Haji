import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

// POST /api/sahabat/setoran-mandiri-pengajuan  body: { nominal, bukti_path, bukti_nama }
// Self-service — anggota Sahabat Baitullah ajukan setoran mandiri (nabung
// ke rekening tabungan umroh MEREKA SENDIRI, lalu upload bukti transfernya
// di sini) biar admin gak perlu ngecek mutasi BSI semua akun satu-satu
// tiap sore (dikonfirmasi user 2026-09-29 — sebelumnya cuma jalur manual
// admin lewat /api/admin/sahabat/setoran-mandiri). BELUM nambah saldo sama
// sekali sampai admin approve (lihat PATCH
// /api/admin/sahabat/setoran-mandiri-pengajuan/[id]).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { nominal, bukti_path, bukti_nama } = await request.json();
    const nominalNum = Number(nominal);
    if (!nominalNum || nominalNum <= 0) return Response.json({ error: 'Nominal harus lebih dari 0' }, { status: 400 });
    if (!bukti_path) return Response.json({ error: 'Bukti transfer wajib diunggah' }, { status: 400 });

    const [[user]] = await pool.query('SELECT role FROM users WHERE id = ?', [auth.user.id]);
    if (!user || user.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Hanya berlaku untuk akun Sahabat Baitullah' }, { status: 400 });
    }

    await pool.query(
      'INSERT INTO sahabat_setoran_mandiri_pengajuan (user_id, nominal, bukti_path, bukti_nama) VALUES (?, ?, ?, ?)',
      [auth.user.id, nominalNum, bukti_path, bukti_nama || null]
    );

    return Response.json({ message: 'Pengajuan setoran mandiri terkirim, menunggu verifikasi admin.' }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// GET /api/sahabat/setoran-mandiri-pengajuan — riwayat pengajuan milik
// akun login sendiri (ditampilkan di tab Cashflow Riwayat Tabungan Umroh).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT id, nominal, bukti_path, bukti_nama, status, catatan_admin, created_at, diproses_at
       FROM sahabat_setoran_mandiri_pengajuan WHERE user_id = ? ORDER BY created_at DESC`,
      [auth.user.id]
    );
    return Response.json({ pengajuan: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
