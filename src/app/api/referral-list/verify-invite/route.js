import pool from '@/lib/db';

const KOLOM_PER_TIPE = {
  perwakilan: 'kode_invite_perwakilan',
  sahabat_baitullah: 'kode_invite_sahabat',
};

/**
 * POST /api/referral-list/verify-invite  body: { kode, tipe? }
 *
 * Cek 1 kode undangan rekrut-perwakilan/sahabat-BARU (`tipe` default
 * 'perwakilan' buat backward-compat) — SENGAJA cuma nerima & balikin hasil
 * 1 kode by-value, TIDAK PERNAH nge-list/expose kode siapapun (beda dari
 * /api/referral-list yang memang publik-listable pakai kode_unik). Kalau
 * endpoint ini ikut nge-return daftar kode, gunanya kode acak buat nyegah
 * tebak-tebakan jadi percuma (dikonfirmasi user 2026-09-03).
 *
 * SENGAJA PUBLIK (tanpa login) — dipakai di /register sebelum akun dibuat,
 * sama alasannya kayak /api/referral-list.
 */
export async function POST(request) {
  try {
    const { kode, tipe } = await request.json();
    const kodeTrim = String(kode || '').trim().toUpperCase();
    if (!kodeTrim) {
      return Response.json({ valid: false });
    }
    const role = tipe === 'sahabat_baitullah' ? 'sahabat_baitullah' : 'perwakilan';
    const kolom = KOLOM_PER_TIPE[role];

    // admin/super_admin JUGA boleh punya kode invite sendiri (dikonfirmasi
    // user 2026-09-19) — buat kantor langsung ngerekrut jamaah/perwakilan
    // baru pakai link, tanpa lewat anggota aktif. Kode-nya sama kolom yang
    // sama, cuma pemiliknya role admin/super_admin, bukan role/kolom ini.
    const [rows] = await pool.query(
      `SELECT id, name, role, kode_unik FROM users
       WHERE role IN (?, 'admin', 'super_admin', 'hop') AND status = 'active' AND ${kolom} = ?`,
      [role, kodeTrim]
    );
    if (rows.length === 0) {
      return Response.json({ valid: false });
    }

    // Nama perekrut yang tampil ke calon pendaftar DISAMARKAN jadi
    // "Management Team" kalau pemilik kode ini admin/super_admin ATAU Head
    // of Program (dikonfirmasi user 2026-10-02 — jangan bocorin nama
    // pribadi staf manajemen ke calon jamaah, mirror labelPerekrut() di
    // src/app/daftar-sahabat/page.jsx yang sudah lebih dulu nerapin ini
    // buat tampilan "siapa yang merekrut Anda" setelah akun dibuat).
    const r = rows[0];
    let nama = r.name;
    if (['admin', 'super_admin', 'hop'].includes(r.role)) {
      nama = 'Management Team';
    } else {
      const [[pengaturan]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
      if (pengaturan?.head_of_program_user_id && String(pengaturan.head_of_program_user_id) === String(r.id)) {
        nama = 'Management Team';
      }
    }

    return Response.json({ valid: true, id: r.id, name: nama, kode_unik: r.kode_unik });
  } catch (error) {
    console.error('POST /api/referral-list/verify-invite gagal:', error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
