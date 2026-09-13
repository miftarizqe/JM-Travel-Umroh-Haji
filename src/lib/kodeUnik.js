// Kode unik cuma dijatah ke akun yang PERNAH AKTIF minimal sekali
// (dikonfirmasi user 2026-09-07) — sebelumnya di-generate langsung pas
// /api/auth/register, jadi akun yang ujung-ujungnya ditolak tetap "makan
// jatah" nomor urut kode padahal gak pernah beneran aktif. Sekarang
// dipanggil dari titik "status jadi active" (status-pendaftaran,
// status-pendaftaran-sahabat, admin/users approve legacy) — idempotent,
// no-op kalau user udah punya kode (mis. udah aktif dari role lain lebih
// dulu, atau dipanggil dobel).
export async function pastikanKodeUnik(conn, userId, role) {
  const [[user]] = await conn.query('SELECT kode_unik FROM users WHERE id = ?', [userId]);
  if (user?.kode_unik) return user.kode_unik;

  const prefix = role === 'perwakilan' ? 'PJM' : role === 'sahabat_baitullah' ? 'SBJM' : 'JUJM';
  const [maxRows] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(kode_unik, ?) AS UNSIGNED)) AS maxNomor
     FROM users WHERE role=? AND kode_unik REGEXP ?`,
    [prefix.length + 1, role, `^${prefix}[0-9]+$`]
  );
  const kodeUnik = prefix + String((maxRows[0].maxNomor || 0) + 1).padStart(4, '0');
  await conn.query('UPDATE users SET kode_unik = ? WHERE id = ?', [kodeUnik, userId]);
  return kodeUnik;
}
