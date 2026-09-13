import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';
import { pastikanKodeInvitePerwakilan } from '@/lib/kodeInvitePerwakilan';
import { pastikanKodeUnik } from '@/lib/kodeUnik';
import { kirimNotifikasi } from '@/lib/notifikasi';

// Urutan step pendaftaran perwakilan — TIDAK BOLEH DILONCATI. SK BSI dihapus
// total dari alur (dikonfirmasi user 2026-08-19) — 'pending' sekarang mewakili
// "Verifikasi Data oleh Admin", satu-satunya gerbang admin sebelum jalur
// kantor/paket, terjadi SETELAH applicant selesai TTD digital formulir +
// setuju PKS + pilih metode (lihat prasyarat formulir_ttd_selesai/
// pks_disetujui/metode_dipilih di GET di bawah).
export const STEP_PENDAFTARAN = [
  { key: 'pending', label: 'Verifikasi Data oleh Admin', urut: 1 },
  { key: 'docs_sent', label: 'Perjanjian Dikirim ke Alamat Anda', urut: 2 },
  { key: 'waiting_docs_return', label: 'Menunggu Rangkapan Dikirim Kembali', urut: 3 },
  { key: 'waiting_visit', label: 'Menunggu Kunjungan Kantor', urut: 2 },
  { key: 'active', label: 'Perwakilan Aktif', urut: 4 },
];

// 'docs_sent'/'waiting_docs_return' (jalur paket) dan 'waiting_visit' (jalur
// kantor) sengaja berbagi urut yang sama karena keduanya OPSIONAL & saling
// eksklusif tergantung metode pendaftaran — bukan langkah berurutan tunggal.
// Makanya validasi "tidak boleh loncat" TIDAK BOLEH pakai STEP_PENDAFTARAN
// mentah (docs_sent akan keanggap wajib dilalui walau applicant pilih jalur
// kantor) — harus difilter ke jalur applicant dulu lewat fungsi ini.
export function pathUntukMetode(metode) {
  const keys = metode === 'paket'
    ? ['pending', 'docs_sent', 'waiting_docs_return', 'active']
    : ['pending', 'waiting_visit', 'active'];
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

    // Sesi TTD digital formulir — dipakai buat guard resume di
    // /daftar-perwakilan (kalau applicant keluar di tengah jalan sebelum
    // sempat setuju PKS/pilih metode, halaman itu bisa arahkan balik ke
    // langkah yang benar, bukan cuma "Lihat Status" mentah).
    const [sigRows] = await pool.query(
      `SELECT id, fase FROM dokumen_signature WHERE dokumen = 'formulir' AND ref_id = ? LIMIT 1`,
      [auth.user.id]
    );
    const sigFormulir = sigRows[0] || null;

    // Checklist prasyarat — supaya step tidak bisa diloncati
    const prasyarat = {
      akun_terverifikasi: !!u.terverifikasi,
      foto_profil: !!u.foto_path,
      formulir_terkirim: !!pendaftaran,
      formulir_ttd_selesai: !!(sigFormulir && sigFormulir.fase === 'selesai'),
      pks_disetujui: !!u.setuju_pks,
      metode_dipilih: !!(pendaftaran && pendaftaran.metode),
    };

    const semuaSiap = Object.values(prasyarat).every(Boolean);
    const statusSekarang = pendaftaran?.status || u.reg_status || null;
    const stepSekarang = STEP_PENDAFTARAN.find(s => s.key === statusSekarang) || null;

    // Riwayat bertanggal buat popup di /profil — dicatat sejak fitur ini
    // ada (2026-08-28), pendaftaran lama sebelum itu gak punya jejak awal.
    const [history] = await pool.query(
      "SELECT status_baru, catatan, created_at FROM pendaftaran_status_log WHERE tipe = 'perwakilan' AND user_id = ? ORDER BY created_at ASC",
      [auth.user.id]
    );

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
      formulir_signature_id: sigFormulir?.id || null,
      history,
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
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('perwakilan', ?, 'ditolak', ?)",
        [p.user_id, catatan_admin || null]
      );
      return Response.json({ message: 'Pendaftaran ditolak.' });
    }

    // metode baru keisi SETELAH applicant TTD digital formulir + setuju PKS
    // (lihat /daftar-perwakilan/metode) — sebelum itu jangan biarkan admin
    // majuin status, karena jalur (kantor/paket) belum jelas.
    if (!p.metode) {
      return Response.json({ error: 'Calon perwakilan belum menyelesaikan TTD formulir, persetujuan PKS, dan pemilihan metode pendaftaran.' }, { status: 400 });
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

    await pool.query(
      'UPDATE agen_pendaftaran SET status = ?, catatan_admin = ? WHERE id = ?',
      [status_baru, catatan_admin || null, pendaftaran_id]
    );
    await pool.query('UPDATE users SET reg_status = ? WHERE id = ?', [status_baru, p.user_id]);
    await pool.query(
      "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('perwakilan', ?, ?, ?)",
      [p.user_id, status_baru, catatan_admin || null]
    );

    // Kalau sudah aktif -> user resmi jadi perwakilan (role_diajukan
    // sekarang cuma bisa 'perwakilan', tidak ada jalur lain lagi).
    // untuk_role_kedua=1 -> ini akun sahabat existing yang DITAMBAHKAN role
    // perwakilan (direkrut langsung manajemen, lihat /api/admin/users
    // action 'tambah_role_kedua') — jangan timpa `role` primer, tulis ke
    // `role_kedua` saja.
    if (status_baru === 'active') {
      if (p.untuk_role_kedua) {
        await pool.query(
          "UPDATE users SET role_kedua = 'perwakilan', role_kedua_ditambahkan_at = COALESCE(role_kedua_ditambahkan_at, NOW()) WHERE id = ?",
          [p.user_id]
        );
      } else {
        await pool.query(
          "UPDATE users SET role = ?, status = 'active', perekrut_id = COALESCE(perekrut_id, ?) WHERE id = ?",
          [p.role_diajukan || 'perwakilan', p.perekrut_id || null, p.user_id]
        );
      }
      // Kode undangan rekrut-perwakilan-baru — digenerate sekali di sini
      // (gerbang wajib pendaftaran akun Perwakilan baru, dikonfirmasi user
      // 2026-09-03), no-op kalau sudah pernah punya.
      await pastikanKodeInvitePerwakilan(pool, p.user_id);
      // Kode unik (PJMxxxx) — baru dijatah SEKARANG, akun beneran aktif
      // (dikonfirmasi user 2026-09-07). No-op kalau untuk_role_kedua dan
      // udah punya kode dari role primernya.
      await pastikanKodeUnik(pool, p.user_id, p.role_diajukan || 'perwakilan');

      // Perekrut FINAL (bukan p.perekrut_id mentah dari agen_pendaftaran —
      // itu cuma fallback di COALESCE di atas, users.perekrut_id yang udah
      // ke-set sebelumnya, misal dari /register, harus menang).
      const [[userSetelahAktif]] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [p.user_id]);

      // Notifikasi aktivasi — dulu jalur ini (step-tracker) TIDAK ngirim
      // notif sama sekali, beda dari jalur approve satunya lagi di
      // /api/admin/users. Disamakan (dikonfirmasi user 2026-09-03) biar
      // perwakilan & perekrutnya selalu tau kapanpun approve-nya lewat
      // jalur mana.
      await kirimNotifikasi(pool, {
        user_id: p.user_id,
        tipe: 'akun_aktif',
        judul: 'Akun Anda Aktif!',
        pesan: 'Selamat, akun Perwakilan Anda sudah dikonfirmasi admin. Anda sekarang bisa order jamaah.',
        link: '/dashboard/perwakilan',
      });
      if (userSetelahAktif?.perekrut_id) {
        await kirimNotifikasi(pool, {
          user_id: userSetelahAktif.perekrut_id,
          tipe: 'downline_baru',
          judul: 'Downline Baru Aktif',
          pesan: `${p.nama} baru saja aktif sebagai Perwakilan di jaringan Anda.`,
          link: '/dashboard/perwakilan',
        });
      }
    }

    return Response.json({ message: 'Status pendaftaran diperbarui.', status: status_baru });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
