import pool from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body.name||'').trim();
    const email = String(body.email||'').trim();
    const wa = String(body.wa||'').trim();
    const nik = String(body.nik||'').trim();
    // Agama (Islam/Non-Islam) — dikonfirmasi user 2026-09-20, berlaku SEMUA
    // role, dipakai nentuin dokumen perjanjian yang dipakai kalau akhirnya
    // daftar Sahabat Baitullah (skema referral non-Muslim).
    const agama = ['islam', 'non_islam'].includes(body.agama) ? body.agama : null;
    const password = String(body.password||'').trim();
    const role = body.role || 'jamaah';
    // perekrut_id CUMA berlaku utk role perwakilan/sahabat (rantai
    // komisi override rekan-merekrut-rekan) — role jamaah TIDAK PERNAH
    // nulis ke kolom ini, walau body ngirim perekrut_id (mis. nyasar dari
    // switch role sahabat->jamaah di halaman register), biar gak ketuker
    // sama referral permanen jamaah di bawah (kolom terpisah).
    const perekrutId = (body.perekrut_id && (role === 'perwakilan' || role === 'sahabat_baitullah'))
      ? String(body.perekrut_id).trim() : null;

    // Validasi field wajib
    if (!name || !email || !wa || !nik || !agama || !password || !role) {
      return Response.json({ error: 'Semua field wajib diisi' }, { status: 400 });
    }

    // Role "agen" sudah dihapus dari sistem — tolak eksplisit dengan pesan
    // yang jelas (kalau tidak, INSERT di bawah bakal gagal mentah karena
    // enum users.role di DB sudah tidak punya 'agen' lagi).
    if (role === 'agen') {
      return Response.json({ error: 'Role "agen" sudah tidak tersedia. Gunakan role "perwakilan".' }, { status: 400 });
    }

    // Perekrut (kalau dipilih) menentukan rantai komisi override.
    // Aturan: perwakilan hanya bisa direkrut perwakilan lain, sahabat hanya
    // bisa direkrut anggota sahabat lain (komisi flat sekali per rekrutan,
    // bukan rantai override berjenjang kayak perwakilan).
    // admin/super_admin JUGA valid jadi perekrut (dikonfirmasi user
    // 2026-09-19) — link referral admin (lihat /api/admin/kode-invite)
    // dianggap "direkrut langsung manajemen JM Travel", BUKAN rantai
    // member-ke-member — konsekuensinya di cascade ujroh registrasi, bukan
    // di sini (lihat status-pendaftaran-sahabat/route.js & status-pendaftaran/route.js).
    if (perekrutId && role === 'perwakilan') {
      const [p] = await pool.query(
        `SELECT id FROM users WHERE id = ? AND (role IN ('perwakilan','admin','super_admin') OR role_kedua = 'perwakilan') AND status = 'active'`,
        [perekrutId]
      );
      if (p.length === 0) {
        return Response.json({ error: 'Perekrut tidak ditemukan atau sedang tidak aktif' }, { status: 400 });
      }
    }
    if (perekrutId && role === 'sahabat_baitullah') {
      const [p] = await pool.query(
        `SELECT id FROM users WHERE id = ? AND (role IN ('sahabat_baitullah','admin','super_admin') OR role_kedua = 'sahabat_baitullah') AND status = 'active'`,
        [perekrutId]
      );
      if (p.length === 0) {
        return Response.json({ error: 'Perekrut tidak ditemukan atau sedang tidak aktif' }, { status: 400 });
      }
    }

    // Referral permanen jamaah (perwakilan/sahabat yg mereferensikan jamaah
    // ini SAAT REGISTRASI, TERPISAH dari perekrut_id di atas) — cuma
    // berlaku utk role jamaah, diisi kolom permanen SEKALI, gak bisa diubah
    // lagi selamanya (lihat migration-referral-permanen-jamaah.sql). Invalid
    // atau nonaktif -> diabaikan diam-diam, gak menggagalkan registrasi.
    let perekrutPerwJamaahId = null;
    let perekrutKopJamaahId = null;
    if (role === 'jamaah') {
      const refPerw = body.ref_perwakilan_jamaah_id ? String(body.ref_perwakilan_jamaah_id).trim() : null;
      if (refPerw) {
        const [p] = await pool.query(
          `SELECT id FROM users WHERE id = ? AND (role = 'perwakilan' OR role_kedua = 'perwakilan') AND status = 'active'`, [refPerw]
        );
        if (p.length > 0) perekrutPerwJamaahId = refPerw;
      }
      const refKop = body.ref_sahabat_jamaah_id ? String(body.ref_sahabat_jamaah_id).trim() : null;
      if (refKop) {
        const [k] = await pool.query(
          `SELECT id FROM users WHERE id = ? AND (role = 'sahabat_baitullah' OR role_kedua = 'sahabat_baitullah') AND status = 'active'`, [refKop]
        );
        if (k.length > 0) perekrutKopJamaahId = refKop;
      }
    }

    // Cek duplikat
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email=? OR wa=? OR nik=?',
      [email, wa, nik]
    );
    if (existing.length > 0) {
      return Response.json({ error: 'Email, WA, atau NIK sudah terdaftar' }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    // Jamaah langsung AKTIF, tidak perlu ACC admin.
    // Perwakilan & sahabat tetap pending sampai funnel pendaftarannya
    // selesai (lihat /api/daftar-sahabat dan /api/status-pendaftaran-sahabat
    // buat sahabat — bukti TF, SPK-AK, akun BSI, tabungan haji, SK-CIF).
    const status = (role === 'perwakilan' || role === 'sahabat_baitullah') ? 'pending' : 'active';

    // Kode unik CUMA dijatah ke akun yang beneran aktif (dikonfirmasi user
    // 2026-09-07) — kalau masih 'pending', kode_unik dikosongkan dulu (NULL,
    // kolomnya udah nullable+unique jadi aman banyak NULL sekaligus), baru
    // digenerate pastikanKodeUnik() pas status beneran jadi 'active' (lihat
    // /api/status-pendaftaran & /api/status-pendaftaran-sahabat) — biar akun
    // yang ujung-ujungnya ditolak gak "makan jatah" nomor urut kode.
    // 'jamaah' langsung aktif jadi tetap generate di sini juga, pakai MAX
    // nomor urut yang ada (bukan COUNT(*), soalnya COUNT bisa collide kalau
    // ada gap di sequence — ketemu bug nyata pas testing 2026-09-03).
    let kodeUnik = null;
    if (status === 'active') {
      const prefix = role === 'perwakilan' ? 'PJM' : role === 'sahabat_baitullah' ? 'SBJM' : 'JUJM';
      const [maxRows] = await pool.query(
        `SELECT MAX(CAST(SUBSTRING(kode_unik, ?) AS UNSIGNED)) AS maxNomor
         FROM users WHERE role=? AND kode_unik REGEXP ?`,
        [prefix.length + 1, role, `^${prefix}[0-9]+$`]
      );
      kodeUnik = prefix + String((maxRows[0].maxNomor || 0) + 1).padStart(4, '0');
    }
    await pool.query(
      // terverifikasi = 0: akun baru WAJIB verifikasi WA/Email dulu
      `INSERT INTO users (name, email, wa, nik, agama, password, role, kode_unik, status, terverifikasi, perekrut_id,
        perekrut_perwakilan_jamaah_id, perekrut_sahabat_jamaah_id) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)`,
      [name, email, wa, nik, agama, hashedPassword, role, kodeUnik, status, perekrutId,
        perekrutPerwJamaahId, perekrutKopJamaahId]
    );

    return Response.json({ message: 'Registrasi berhasil!', kodeUnik }, { status: 201 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}