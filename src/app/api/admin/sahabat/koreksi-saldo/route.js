import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// Saldo confirmed saat ini — SAMA PERSIS list yang dipakai /api/sahabat/dashboard
// buat nampilin "Saldo Tabungan Umroh" ke member (WAJIB tetap sinkron kalau
// list itu berubah), dipakai buat nge-cap nominal koreksi biar gak bikin
// saldo minus.
const JENIS_SALDO = [
  'komisi_sahabat', 'closing_langsung_sahabat', 'referral_closing_reguler_sahabat',
  'tabungan_awal_sahabat', 'head_of_program_registrasi', 'pemakaian_saldo_sahabat',
  'setoran_mandiri_sahabat', 'koreksi_saldo_sahabat',
];

// POST /api/admin/sahabat/koreksi-saldo — kurangi saldo tabungan umroh
// seorang Jamaah Sahabat Baitullah secara manual (dikonfirmasi user
// 2026-09-21). SENGAJA super_admin-only ("angka fatal", sama level proteksi
// kayak Pengaturan Komisi) — beda dari Setoran Mandiri yang admin biasa boleh
// input, ini ngurangin duit orang jadi risikonya lebih tinggi kalau salah.
//
// 3 pagar keamanan di server (UI-nya juga wajib modal konfirmasi ketik-ulang,
// tapi itu gak cukup — harus dicek ulang di sini):
//  1. keterangan WAJIB diisi — gak boleh nominal doang tanpa alasan.
//  2. nominal gak boleh melebihi saldo confirmed member saat ini (gak boleh
//     bikin saldo jadi minus).
//  3. APPEND-ONLY — selalu INSERT baris baru (nominal negatif), TIDAK PERNAH
//     UPDATE/DELETE baris lama. Riwayat penuh tetap ada buat audit, kalau
//     ternyata koreksinya sendiri salah, dibalikin lewat Setoran Mandiri
//     (baris baru lagi), bukan dihapus.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { user_id, nominal, keterangan } = await request.json();
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });
    const nominalNum = Number(nominal);
    if (!nominalNum || nominalNum <= 0) {
      return Response.json({ error: 'Nominal harus lebih dari 0' }, { status: 400 });
    }
    if (!keterangan || !String(keterangan).trim()) {
      return Response.json({ error: 'Alasan koreksi wajib diisi — jangan cuma angka tanpa keterangan.' }, { status: 400 });
    }

    const [[u]] = await pool.query('SELECT id, name FROM users WHERE id = ? AND role = ?', [user_id, 'sahabat_baitullah']);
    if (!u) return Response.json({ error: 'Akun Jamaah Sahabat Baitullah tidak ditemukan' }, { status: 404 });

    const [saldoRows] = await pool.query(
      `SELECT nominal FROM komisi_ledger WHERE penerima_id = ? AND dikonfirmasi_at IS NOT NULL
       AND jenis IN (${JENIS_SALDO.map(() => '?').join(',')})`,
      [user_id, ...JENIS_SALDO]
    );
    const saldoSaatIni = saldoRows.reduce((s, r) => s + Number(r.nominal || 0), 0);
    if (nominalNum > saldoSaatIni) {
      return Response.json({
        error: `Nominal koreksi (Rp${nominalNum.toLocaleString('id-ID')}) melebihi saldo tabungan saat ini (Rp${saldoSaatIni.toLocaleString('id-ID')}). Tidak boleh membuat saldo minus.`,
      }, { status: 400 });
    }

    const keteranganTrim = String(keterangan).trim();
    const [result] = await pool.query(
      `INSERT INTO komisi_ledger (booking_id, ref_id, penerima_id, penerima_nama, jenis, jumlah_jamaah, nominal, keterangan, dikonfirmasi_at)
       VALUES (NULL, ?, ?, ?, 'koreksi_saldo_sahabat', 1, ?, ?, NOW())`,
      [user_id, user_id, u.name, -nominalNum, `Koreksi saldo (admin): ${keteranganTrim}`]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'sahabat_koreksi_saldo',
      target_type: 'komisi_ledger',
      target_id: String(result.insertId),
      keterangan: `Koreksi (kurangi) saldo Rp${nominalNum.toLocaleString('id-ID')} untuk ${u.name} — alasan: ${keteranganTrim}`,
    });

    return Response.json({ message: 'Koreksi saldo tercatat.', saldo_setelah: saldoSaatIni - nominalNum });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
