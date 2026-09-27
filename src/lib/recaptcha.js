// Verifikasi token Google reCAPTCHA v2 (dikonfirmasi user 2026-09-27) —
// dipasang di registrasi buat cegah bot. Kalau RECAPTCHA_SECRET_KEY belum
// diisi di .env, verifikasi di-skip (anggap lolos) biar dev lokal & deploy
// awal sebelum key didaftarkan tetap bisa jalan.
export async function verifikasiRecaptcha(token, ip) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip) params.set('remoteip', ip);
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}
