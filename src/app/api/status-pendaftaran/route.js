import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';

// Urutan step pendaftaran perwakilan — TIDAK BOLEH DILONCATI
export const STEP_PENDAFTARAN = [
  { key: 'pending', label: 'Formulir Pendaftaran Terkirim', urut: 1 },
  { key: 'sk_bsi_verified', label: 'SK BSI Terverifikasi', urut: 2 },
  { key: 'docs_sent', label: 'Dokumen Dikirim', urut: 3 },
  { key: 'waiting_docs_return', label: 'Menunggu Dokumen Kembali', urut: 4 },
  { key: 'waiting_visit', label: 'Menunggu Kunjungan Kantor', urut: 4 },
  { key: 'active', label: 'Perwakilan Aktif', urut: 5 },
];

// 'docs_sent'/'waiting_docs_return' (jalur paket) dan 'waiting_visit' (jalur
// kantor) sengaja berbagi urut yang sama karena keduanya OPSIONAL & saling
// eksklusif tergantung metode pendaftaran — bukan langkah berurutan tunggal.
// Makanya validasi "tidak boleh loncat" TIDAK BOLEH pakai STEP_PENDAFTARAN
// mentah (docs_sent akan keanggap wajib dilalui walau applicant pilih jalur
// kantor) — harus difilter ke jalur applicant dulu lewat fungsi ini.
export function pathUntukMetode(metode) {
  const keys = metode === 'paket'
    ? ['pending', 'sk_bsi_verified', 'docs_sent', 'waiting_docs_return', 'active']
    : ['pending', 'sk_bsi_verified', 'waiting_visit', 'active'];
  return keys.map(k => STEP_PENDAFTARAN.find(s => s.key === k));
}

// GET /api/status-pendaftaran — status pendaftaran milik user login
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [users] = await pool.query(
      `SELECT id, name, role, status, reg_status, reg_metode, reg_jadwal,
              terverifikasi, foto_path, setuju_pks
       FROM users WHERE id = ?`, [auth.user.id]
    );
    if (users.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });
    const u = users[0];

    // Ambil pendaftaran perwakilan (kalau ada)
    const [ag] = await pool.query(
      'SELECT * FROM agen_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [auth.user.id]
    );
    const pendaftaran = ag[0] || null;

    // Checklist prasyarat — supaya step tidak bisa diloncati
    const prasyarat = {
      akun_terverifikasi: !!u.terverifikasi,
      foto_profil: !!u.foto_path,
      setuju_pks: !!u.setuju_pks,
      formulir_terkirim: !!pendaftaran,
      sk_bsi_diunggah: !!(pendaftaran && pendaftaran.sk_bsi_path),
    };

    const semuaSiap = Object.values(prasyarat).every(Boolean);
    const statusSekarang = pendaftaran?.status || u.reg_status || null;
    const stepSekarang = STEP_PENDAFTARAN.find(s => s.key === statusSekarang) || null;

    return Response.json({
      user: {
        id: u.id, name: u.name, role: u.role, status: u.status,
        terverifikasi: !!u.terverifikasi, foto_path: u.foto_path,
      },
      pendaftaran,
      steps: STEP_PENDAFTARAN,
      step_sekarang: stepSekarang,
      prasyarat,
      semua_prasyarat_siap: semuaSiap,
      metode: pendaftaran?.metode || u.reg_metode || null,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/status-pendaftaran — admin memajukan status (tidak boleh melompat)
// body: { pendaftaran_id, status_baru, catatan_admin? }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const { pendaftaran_id, status_baru, catatan_admin } = await request.json();
    if (!pendaftaran_id || !status_baru) {
      return Response.json({ error: 'pendaftaran_id dan status_baru wajib diisi' }, { status: 400 });
    }

    const [rows] = await pool.query('SELECT * FROM agen_pendaftaran WHERE id = ?', [pendaftaran_id]);
    if (rows.length === 0) return Response.json({ error: 'Pendaftaran tidak ditemukan' }, { status: 404 });
    const p = rows[0];

    if (status_baru === 'ditolak') {
      await pool.query(
        "UPDATE agen_pendaftaran SET status = 'ditolak', catatan_admin = ? WHERE id = ?",
        [catatan_admin || null, pendaftaran_id]
      );
      await pool.query("UPDATE users SET status = 'rejected' WHERE id = ?", [p.user_id]);
      return Response.json({ message: 'Pendaftaran ditolak.' });
    }

    // Divalidasi terhadap jalur applicant sendiri (kantor ATAU paket) —
    // docs_sent/waiting_docs_return dan waiting_visit saling eksklusif,
    // jangan dicampur pakai urut mentah STEP_PENDAFTARAN (lihat komentar di atas).
    const path = pathUntukMetode(p.metode);
    const skrgIdx = path.findIndex(s => s.key === p.status);
    const tujuanIdx = path.findIndex(s => s.key === status_baru);
    if (tujuanIdx === -1) {
      return Response.json({ error: `Status "${status_baru}" tidak berlaku untuk jalur pendaftaran ${p.metode || 'kantor'}.` }, { status: 400 });
    }

    // TIDAK BOLEH MELONCAT: hanya boleh maju 1 tingkat
    if (skrgIdx !== -1 && tujuanIdx > skrgIdx + 1) {
      return Response.json(
        { error: `Tidak boleh melompat step. Selesaikan "${path[skrgIdx + 1]?.label}" dulu.` },
        { status: 400 }
      );
    }

    // Sebelum SK BSI diverifikasi, berkasnya harus ada
    if (status_baru === 'sk_bsi_verified' && !p.sk_bsi_path) {
      return Response.json({ error: 'SK BSI belum diunggah oleh calon perwakilan.' }, { status: 400 });
    }

    await pool.query(
      'UPDATE agen_pendaftaran SET status = ?, catatan_admin = ? WHERE id = ?',
      [status_baru, catatan_admin || null, pendaftaran_id]
    );
    await pool.query('UPDATE users SET reg_status = ? WHERE id = ?', [status_baru, p.user_id]);

    // Kalau sudah aktif -> user resmi jadi perwakilan (role_diajukan
    // sekarang cuma bisa 'perwakilan', tidak ada jalur lain lagi).
    if (status_baru === 'active') {
      await pool.query(
        "UPDATE users SET role = ?, status = 'active', perekrut_id = COALESCE(perekrut_id, ?) WHERE id = ?",
        [p.role_diajukan || 'perwakilan', p.perekrut_id || null, p.user_id]
      );
    }

    return Response.json({ message: 'Status pendaftaran diperbarui.', status: status_baru });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
