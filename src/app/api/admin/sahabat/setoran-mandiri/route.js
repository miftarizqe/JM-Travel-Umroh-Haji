import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// POST /api/admin/sahabat/setoran-mandiri — catat 1 transaksi setoran
// mandiri jamaah ke tabungan umroh BSI mereka SENDIRI (bukan ujroh/closing
// yang lewat JM Travel). Gak ada API BSI, jadi admin ngecek mutasi rekening
// manual tiap sore dan input per-transaksi kalau ada yang baru masuk
// (dikonfirmasi user 2026-09-02).
//
// BEDA dari komisi_ledger baris lain yang lahir 'pending' lalu di-confirm
// belakangan (lihat PATCH .../komisi/[id]) — di sini gak ada duit yang
// lewat JM Travel sama sekali, admin cuma MENCATAT fakta eksternal yang
// udah dia lihat sendiri di rekening, jadi langsung lahir dikonfirmasi_at
// terisi (gak ada tahap approval terpisah). admin biasa (bukan cuma
// super_admin) boleh input — beda dari konfirmasi ujroh yang wajib
// super_admin karena itu duit yang beneran ditransfer JM Travel.
// SENGAJA gak wajib bukti upload (dikonfirmasi user — catatan teks aja
// cukup, biar cepat buat rutinitas cek sore).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { user_id, nominal, keterangan } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
    const nominalNum = Number(nominal);
    if (!nominalNum || nominalNum <= 0) {
      return Response.json({ error: 'Nominal harus lebih dari 0' }, { status: 400 });
    }

    const [[u]] = await pool.query('SELECT id, name FROM users WHERE id = ? AND role = ?', [user_id, 'sahabat_baitullah']);
    if (!u) return Response.json({ error: 'Akun Jamaah Sahabat Baitullah tidak ditemukan' }, { status: 404 });

    const [result] = await pool.query(
      `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan, dikonfirmasi_at)
       VALUES (NULL, ?, ?, ?, 'setoran_mandiri_sahabat', 1, ?, ?, NOW())`,
      [user_id, user_id, u.name, nominalNum, keterangan?.trim() || 'Setoran mandiri jamaah — dicatat dari cek mutasi rekening']
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'sahabat_setoran_mandiri_catat',
      target_type: 'komisi_ledger',
      target_id: String(result.insertId),
      keterangan: `Catat setoran mandiri Rp${nominalNum.toLocaleString('id-ID')} untuk ${u.name}`,
    });

    return Response.json({ message: 'Setoran mandiri tercatat.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
