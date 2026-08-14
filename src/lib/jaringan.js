// Cek apakah targetId ada di jaringan downline calonAtasanId (langsung ATAU
// berjenjang) dengan jalan ke ATAS lewat perekrut_id. Dipakai buat otorisasi:
// perwakilan cuma boleh lihat closing milik orang yang beneran ada di bawah
// jaringannya.
export async function apakahDalamJaringan(pool, calonAtasanId, targetId) {
  if (calonAtasanId === targetId) return true;
  let cur = targetId;
  let hop = 0;
  while (cur && hop < 20) {
    const [r] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [cur]);
    const next = r[0]?.perekrut_id;
    if (!next) return false;
    if (next === calonAtasanId) return true;
    cur = next;
    hop++;
  }
  return false;
}
