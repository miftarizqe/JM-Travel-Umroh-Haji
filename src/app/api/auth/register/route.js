import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { nomorKodeUnikBerikutnya } from '@/lib/kodeUnik';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';
import { buatLimiter, ipKlien, responsTerlaluBanyak } from '@/lib/rateLimit';
import { emailValid, nikValid, normalisasiWA, varianWA } from '@/lib/validasiAkun';

// Cegah spam pembuatan akun: 10 registrasi per IP per jam.
const limitIP = buatLimiter(10, 60 * 60 * 1000);
const MAX_RETRY_KODE = 5;

export async function POST(request) {
  try {
    const r = limitIP.cek(ipKlien(request));
    if (!r.boleh) return responsTerlaluBanyak(r.sisaDetik);

    const body = await request.json();
    const name = String(body.name||'').trim();
    const email = String(body.email||'').trim().toLowerCase();
    const waInput = String(body.wa||'').trim();
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
    if (!name || !email || !waInput || !nik || !agama || !password || !role) {
      return Response.json({ error: 'Semua field wajib diisi' }, { status: 400 });
    }
    if (name.length > 100) {
      return Response.json({ error: 'Nama maksimal 100 karakter' }, { status: 400 });
    }
    if (!nikValid(nik)) {
      return Response.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }
    if (!emailValid(email)) {
      return Response.json({ error: 'Format email tidak valid' }, { status: 400 });
    }
    // Disimpan seragam "08…" biar login via WA & cek duplikat konsisten.
    const wa = normalisasiWA(waInput);
    if (!wa) {
      return Response.json({ error: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password minimal 8 karakter' }, { status: 400 });
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
      'SELECT id FROM users WHERE email=? OR wa IN (?) OR nik=?',
      [email, varianWA(wa), nik]
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
    // 'jamaah' langsung aktif jadi tetap generate di sini juga.
    // kode_unik UNIQUE: dua registrasi bersamaan bisa dapat nomor sama →
    // INSERT kedua ditolak DB (ER_DUP_ENTRY) lalu dicoba ulang dengan nomor
    // baru. Duplikat di kolom lain (email/WA/NIK, lolos cek di atas karena
    // race) dibalas 400, bukan 500.
    const prefix = role === 'perwakilan' ? 'PJM' : role === 'sahabat_baitullah' ? 'SBJM' : 'JUJM';
    let kodeUnik = null;
    for (let percobaan = 1; ; percobaan++) {
      kodeUnik = status === 'active' ? await nomorKodeUnikBerikutnya(pool, prefix) : null;
      try {
        await pool.query(
          // terverifikasi = 0: akun baru menunggu verifikasi admin (pengganti
          // OTP WA/Email, 2026-09-25) — di-ACC lewat Admin > Pengguna
          // (action 'verifikasi_akun' di /api/admin/users). Sebelum itu
          // cekPemesanBolehOrder & prasyarat daftar-perwakilan menahan akun.
          `INSERT INTO users (name, email, wa, nik, agama, password, role, kode_unik, status, terverifikasi, perekrut_id,
            perekrut_perwakilan_jamaah_id, perekrut_sahabat_jamaah_id) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)`,
          [name, email, wa, nik, agama, hashedPassword, role, kodeUnik, status, perekrutId,
            perekrutPerwJamaahId, perekrutKopJamaahId]
        );
        break;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
        if (String(e.message).includes('kode_unik')) {
          if (percobaan < MAX_RETRY_KODE) continue;
          throw e;
        }
        return Response.json({ error: 'Email, WA, atau NIK sudah terdaftar' }, { status: 400 });
      }
    }

    // Gagal kirim notif jangan bikin registrasi yang udah tersimpan jadi 500.
    const roleLabel = { perwakilan: 'Perwakilan', sahabat_baitullah: 'Jamaah Sahabat Baitullah' }[role] || 'Jamaah';
    await kirimNotifikasiAdmin(pool, {
      tipe: 'akun_perlu_verifikasi',
      judul: 'Akun Baru Menunggu Verifikasi',
      pesan: `${name} (${roleLabel}) baru mendaftar dan menunggu verifikasi akun.`,
      link: '/admin?tab=users',
    }).catch(e => console.error('Gagal kirim notifikasi admin:', e));

    return Response.json({ message: 'Registrasi berhasil! Akun Anda menunggu verifikasi admin.', kodeUnik }, { status: 201 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}