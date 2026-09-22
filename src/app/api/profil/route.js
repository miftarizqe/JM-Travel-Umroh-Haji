import pool from '@/lib/db';
import { wajibPemilikAtauAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

// NIK & seluruh data rekening (identitas + tujuan transfer duit, "ngaruh
// kemana2") — SEMULA dibuka self-service dengan pengaman audit+notifikasi
// (2026-08-30 pagi), TAPI dikunci ulang jadi ADMIN-ONLY (2026-08-30 sore,
// dikonfirmasi user) karena terlalu sensitif buat self-service walau
// diaudit. `alamat` TETAP self-service (gak termasuk daftar ini).
const FIELD_ADMIN_ONLY = ['nik', 'bank', 'no_rekening', 'nama_pemilik_rekening', 'no_rekening_bsi_biasa', 'no_rekening_tabungan_umroh'];
// email & wa — SAMA alasannya kayak NIK, ditambahin 2026-09-20 (dikonfirmasi
// user, berlaku SEMUA role): begitu keisi pas registrasi/verifikasi awal,
// gak boleh diganti sendiri lagi — nyegah orang "cuci" identitas lewat akun
// yang udah keburu keverifikasi/terpercaya. BEDA dari FIELD_ADMIN_ONLY di
// atas (yang field-nya OPSIONAL, boleh gak dikirim body sama sekali) — email
// & wa WAJIB ada di tiap body (dipakai validasi lain di bawah), jadi
// gerbangnya bandingin ke nilai LAMA, bukan cuma "field ini ada di body atau
// enggak".
// Field umum (semua role, self-service) + field khusus role sahabat
// (admin-only, lihat FIELD_ADMIN_ONLY) — TIDAK termasuk nama/email/wa
// (itu tetap lewat jalur wajib di bawah, sudah ada).
const FIELD_UMUM = ['nik', 'alamat', 'bank', 'no_rekening', 'nama_pemilik_rekening', 'no_paspor'];
const FIELD_SAHABAT = ['no_rekening_bsi_biasa', 'no_rekening_tabungan_umroh'];

// GET /api/profil?user_id=xxx — ambil data user TERKINI dari DB
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    if (!userId) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, userId);
    if (auth.error) return auth.error;

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.wa, u.nik, u.role, u.kode_unik, u.status, u.wilayah, u.foto_path,
              u.points, u.tabungan_bsi, u.perekrut_id, p.name AS perekrut_nama, u.reg_status, u.reg_metode, u.reg_jadwal,
              u.alamat_kirim, u.alamat, u.bank, u.no_rekening, u.nama_pemilik_rekening, u.no_paspor,
              u.no_rekening_bsi_biasa, u.no_rekening_tabungan_umroh, u.created_at,
              u.perekrut_perwakilan_jamaah_id, rp.name AS perekrut_perwakilan_jamaah_nama, rp.kode_unik AS perekrut_perwakilan_jamaah_kode,
              u.perekrut_sahabat_jamaah_id, rk.name AS perekrut_sahabat_jamaah_nama, rk.kode_unik AS perekrut_sahabat_jamaah_kode,
              u.kode_invite_perwakilan, u.tabungan_haji_status, u.cif_bsi, u.agama,
              u.dokumen_spk_ak_fisik_path, u.dokumen_sk_cif_fisik_path
       FROM users u
       LEFT JOIN users p ON p.id = u.perekrut_id
       LEFT JOIN users rp ON rp.id = u.perekrut_perwakilan_jamaah_id
       LEFT JOIN users rk ON rk.id = u.perekrut_sahabat_jamaah_id
       WHERE u.id = ?`, [userId]
    );
    if (rows.length === 0) return Response.json({ error: 'User tidak ditemukan' }, { status: 404 });

    const user = rows[0];

    // Cek apakah sudah pernah umroh (punya booking selesai) -> syarat upgrade perwakilan
    const [sel] = await pool.query(
      "SELECT COUNT(*) AS jml FROM bookings WHERE user_id = ? AND status = 'selesai'", [userId]
    );
    user.sudah_umroh = Number(sel[0]?.jml || 0) > 0;

    // Apakah user BENAR-BENAR punya pengajuan pendaftaran perwakilan?
    // Jangan andalkan reg_status saja — kolom itu bisa terisi sisa data lama,
    // sehingga blok "Status Pendaftaran" muncul pada jamaah biasa
    // yang tidak pernah mendaftar jadi perwakilan.
    let sedangDaftarAgen = false;
    let statusPerwakilan = null;
    try {
      const [ap] = await pool.query(
        "SELECT status FROM agen_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        [userId]
      );
      if (ap.length > 0) {
        statusPerwakilan = ap[0].status;
        sedangDaftarAgen = ap[0].status !== 'ditolak';
      }
    } catch {
      // tabel belum ada -> anggap tidak sedang mendaftar
      sedangDaftarAgen = false;
    }
    user.sedang_daftar_agen = sedangDaftarAgen;
    user.pendaftaran_status_perwakilan = statusPerwakilan;

    // Sama polanya buat sahabat — baris "Status Pendaftaran" di /profil
    // dipakai KEDUA role, ditentukan mana yang relevan dari flag ini.
    const [kp] = await pool.query(
      'SELECT status FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [userId]
    );
    user.sedang_daftar_sahabat = kp.length > 0 && kp[0].status !== 'ditolak';
    user.pendaftaran_status_sahabat = kp[0]?.status || null;

    // Dokumen SPK-AK/SK-CIF — dipindah dari /dashboard/sahabat ke sini
    // (dikonfirmasi user 2026-09-22, "Status Keanggotaan" sekarang di
    // Profil, bukan Beranda). Logic SAMA PERSIS /api/sahabat/dashboard:
    // digital (dokumen_signature rangkap='travel') diprioritaskan, fallback
    // scan fisik. SPK-AK beda dokumen buat anggota non-Muslim.
    if (user.role === 'sahabat_baitullah') {
      const dokumenSpkAk = user.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
      const [[sigSpkAk]] = await pool.query(
        `SELECT pdf_final_path FROM dokumen_signature WHERE dokumen = ? AND rangkap = 'travel' AND ref_id = ? ORDER BY id DESC LIMIT 1`,
        [dokumenSpkAk, userId]
      );
      user.dokumen = {
        spk_ak: sigSpkAk?.pdf_final_path || user.dokumen_spk_ak_fisik_path || null,
        sk_cif: user.dokumen_sk_cif_fisik_path || null,
      };

      // Voucher welcome Rp1jt — ikut dipindah dari Beranda ke Profil
      // (dikonfirmasi user 2026-09-22). `tampil=0` SENGAJA (voucher ini gak
      // pernah nongol di listing /voucher biasa, lihat komentar di
      // /api/vouchers/saya) — dashboard/profil adalah SATU-SATUNYA tempat
      // member bisa lihat status voucher ini, jangan sampai hilang total.
      const [voucherRows] = await pool.query(
        `SELECT kode, potongan, valid_until, used, aktif, created_at
         FROM vouchers WHERE for_user = ? AND akses_role = 'akun'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (voucherRows[0]) {
        const [[pengHop]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
        const isHop = pengHop?.head_of_program_user_id && String(pengHop.head_of_program_user_id) === String(userId);
        user.voucher_pendaftaran = { ...voucherRows[0], blocked_hop: !!isHop };
      } else {
        user.voucher_pendaftaran = null;
      }
    }

    return Response.json({ user });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/profil — update nama, email, wa (wajib), + field data-diri/
// rekening opsional (diperluas 2026-08-30, berlaku semua role — reuse buat
// koreksi mandiri field yang tadinya cuma bisa diisi sekali lewat endpoint
// khusus, mis. /api/sahabat/rekening-bsi, /api/sahabat/cif-bsi).
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { user_id, name, email, wa } = body;
    if (!user_id) return Response.json({ error: 'user_id wajib diisi' }, { status: 400 });

    const auth = wajibPemilikAtauAdmin(request, user_id);
    if (auth.error) return auth.error;
    if (!name || !String(name).trim()) {
      return Response.json({ error: 'Nama wajib diisi' }, { status: 400 });
    }
    if (!wa || !String(wa).trim()) {
      return Response.json({ error: 'No. WhatsApp wajib diisi' }, { status: 400 });
    }

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin && FIELD_ADMIN_ONLY.some(f => f in body)) {
      return Response.json({ error: 'NIK dan data rekening cuma bisa diubah admin. Hubungi admin JM Travel.' }, { status: 403 });
    }

    const [[sebelum]] = await pool.query('SELECT role, email, wa, ' + [...FIELD_UMUM, ...FIELD_SAHABAT].join(', ') + ' FROM users WHERE id = ?', [user_id]);
    if (!sebelum) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });

    if (!isAdmin) {
      const emailBerubah = String(email || '').trim() !== String(sebelum.email || '').trim();
      const waBerubah = String(wa).trim() !== String(sebelum.wa || '').trim();
      if (emailBerubah || waBerubah) {
        return Response.json({ error: 'Email dan No. WhatsApp adalah data verifikasi awal, cuma bisa diubah admin. Hubungi admin JM Travel.' }, { status: 403 });
      }
    }

    // Email & WA harus unik (kecuali milik sendiri)
    const [dupe] = await pool.query(
      'SELECT id FROM users WHERE (wa = ? OR (email = ? AND email IS NOT NULL)) AND id <> ?',
      [wa, email || null, user_id]
    );
    if (dupe.length > 0) {
      return Response.json({ error: 'Email atau No. WhatsApp sudah dipakai akun lain' }, { status: 400 });
    }

    const fieldBoleh = sebelum.role === 'sahabat_baitullah' ? [...FIELD_UMUM, ...FIELD_SAHABAT] : FIELD_UMUM;
    const setKolom = ['name = ?', 'email = ?', 'wa = ?'];
    const nilai = [String(name).trim(), email || null, String(wa).trim()];
    const fieldSensitifBerubah = [];
    for (const f of fieldBoleh) {
      if (!(f in body)) continue;
      const nilaiBaru = body[f] === '' ? null : String(body[f]).trim();
      setKolom.push(`${f} = ?`);
      nilai.push(nilaiBaru);
      if (FIELD_ADMIN_ONLY.includes(f) && nilaiBaru !== (sebelum[f] || null)) fieldSensitifBerubah.push(f);
      // Jaring pengaman: kalau field rekening BSI ini kebetulan pertama kali
      // keisi lewat endpoint ini (bukan lewat /api/sahabat/rekening-bsi
      // yang biasanya nanganin ini), tetap ikut nyalain status terkait —
      // jangan sampai field keisi tapi status_bsi/tabungan_haji nyangkut 0.
      if (!sebelum[f] && nilaiBaru) {
        if (f === 'no_rekening_bsi_biasa') { setKolom.push('akun_bsi_status = 1', 'akun_bsi_updated_at = NOW()'); }
        if (f === 'no_rekening_tabungan_umroh') { setKolom.push('tabungan_haji_status = 1', 'tabungan_haji_updated_at = NOW()'); }
      }
    }
    nilai.push(user_id);

    await pool.query(`UPDATE users SET ${setKolom.join(', ')} WHERE id = ?`, nilai);

    if (fieldSensitifBerubah.length > 0) {
      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'edit_data_sensitif_profil',
        target_type: 'user',
        target_id: user_id,
        keterangan: `${sebelum.role} mengubah field: ${fieldSensitifBerubah.join(', ')}`,
      });
      await kirimNotifikasiAdmin(pool, {
        tipe: 'profil_sensitif_diubah',
        judul: 'Data Sensitif Profil Diubah',
        pesan: `${name} (${sebelum.role}) mengubah: ${fieldSensitifBerubah.join(', ')}. Cek kalau perlu.`,
        link: '/admin?tab=users',
      });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, wa, nik, role, kode_unik, status, points, tabungan_bsi FROM users WHERE id = ?',
      [user_id]
    );

    return Response.json({ message: 'Profil berhasil diperbarui!', user: rows[0] });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
