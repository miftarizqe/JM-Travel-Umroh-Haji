import { DURASI_SESI_DETIK } from '@/lib/auth';

/**
 * Data user yang disimpan frontend di localStorage `user` (cache tampilan,
 * BUKAN bukti login — itu cookie httpOnly). Satu sumber buat /api/auth/login
 * & /api/auth/sesi (isi ulang cache yang hilang padahal sesi masih aktif,
 * 2026-10-15) biar bentuknya gak diam-diam beda.
 *
 * @param {object} user - baris tabel users
 * @param {number} loginAt - epoch detik saat login (login_at token)
 * @param {object} [override] - mis. { role, role_kedua } dari token hasil switch-role
 */
export function dataUserSesi(user, loginAt, override = {}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    wa: user.wa,
    nik: user.nik,
    agama: user.agama || null,
    role: user.role,
    role_kedua: user.role_kedua || null,
    kode_unik: user.kode_unik,
    status: user.status,
    wilayah: user.wilayah,
    points: user.points,
    tabungan_bsi: user.tabungan_bsi,
    wajib_ganti_password: !!user.wajib_ganti_password,
    // Dipakai gerbang "Daftar Program" & checkout di client — sebelumnya
    // gak ikut dikirim, jadi user.terverifikasi selalu undefined dan
    // akun yang udah diverifikasi admin tetap keblokir (bug 2026-10-11).
    terverifikasi: !!user.terverifikasi,
    // Admin "Minta Perbaikan" di Verifikasi Akun — login diarahkan ke
    // /perbaiki-data-akun & Layout nampilin banner (2026-10-11).
    perlu_perbaikan_akun: !!user.perbaikan_akun_diminta_at && !user.terverifikasi,
    ...override,
    // Dipakai useCurrentUser buat ngebuang cache data user begitu sesi habis.
    sesi_berakhir_at: (loginAt + DURASI_SESI_DETIK) * 1000,
  };
}
