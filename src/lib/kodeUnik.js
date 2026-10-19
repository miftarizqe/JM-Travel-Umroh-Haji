// Nomor urut kode unik berikutnya = MAX nomor + 1 (bukan COUNT, karena
// urutan bisa berlubang).
//
// SENGAJA tidak memfilter role: kode_unik UNIQUE untuk semua user, dan
// pemilik kode JUJM bisa berganti role (jamaah dinaikkan jadi perwakilan/
// admin) tanpa kodenya berubah. Dengan filter role, nomor milik mereka lolos
// dari MAX dan setiap registrasi baru menabrak kode itu terus (retry pun
// menghitung nomor yang sama). LIKE prefix memakai indeks UNIQUE kode_unik;
// REGEXP cuma jalan di baris yang sudah lolos LIKE.
export async function nomorKodeUnikBerikutnya(conn, prefix) {
  const [maxRows] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(kode_unik, ?) AS UNSIGNED)) AS maxNomor
     FROM users WHERE kode_unik LIKE ? AND kode_unik REGEXP ?`,
    [prefix.length + 1, `${prefix}%`, `^${prefix}[0-9]+$`]
  );
  return prefix + String(Number(maxRows[0].maxNomor || 0) + 1).padStart(4, '0');
}

// Slug URL-friendly dari nama (lowercase, spasi->strip, buang aksen/simbol)
// — dipakai kode_unik role 'agen' (dikonfirmasi user 2026-10-19, ganti dari
// AGN0001 ke nama asli: link referral lebih gampang diinget/dipercaya
// penerima dibanding nomor urut generik). Dipotong biar muat kode_unik
// varchar(20) sisa ruang buat suffix keunikan "-2"/"-3"/dst.
function slugDariNama(nama) {
  return String(nama || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 16) || 'agen';
}

// Kode unik berbasis NAMA (bukan nomor urut) — cek tabrakan ke kode_unik
// (UNIQUE lintas semua role, kolom utf8mb4_0900_ai_ci = case-insensitive,
// jadi "Ida-Kuraeny" vs "ida-kuraeny" otomatis dianggap sama di DB).
// Tabrakan ditambahin suffix "-2", "-3", dst sampai ketemu yang bebas.
async function kodeUnikDariNama(conn, nama) {
  const base = slugDariNama(nama);
  let kandidat = base;
  for (let n = 2; ; n++) {
    const [rows] = await conn.query('SELECT 1 FROM users WHERE kode_unik = ? LIMIT 1', [kandidat]);
    if (rows.length === 0) return kandidat;
    const suffix = `-${n}`;
    kandidat = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }
}

// Kode unik cuma dijatah ke akun yang PERNAH AKTIF minimal sekali
// (dikonfirmasi user 2026-09-07) — sebelumnya di-generate langsung pas
// /api/auth/register, jadi akun yang ujung-ujungnya ditolak tetap "makan
// jatah" nomor urut kode padahal gak pernah beneran aktif. Sekarang
// dipanggil dari titik "status jadi active" (status-pendaftaran,
// status-pendaftaran-sahabat, admin/users approve legacy) — idempotent,
// no-op kalau user udah punya kode (mis. udah aktif dari role lain lebih
// dulu, atau dipanggil dobel).
export async function pastikanKodeUnik(conn, userId, role) {
  const [[user]] = await conn.query('SELECT kode_unik, name FROM users WHERE id = ?', [userId]);
  if (user?.kode_unik) return user.kode_unik;

  const kodeUnik = role === 'agen'
    ? await kodeUnikDariNama(conn, user?.name)
    : await nomorKodeUnikBerikutnya(conn, role === 'perwakilan' ? 'PJM' : role === 'sahabat_baitullah' ? 'SBJM' : 'JUJM');
  await conn.query('UPDATE users SET kode_unik = ? WHERE id = ?', [kodeUnik, userId]);
  return kodeUnik;
}
