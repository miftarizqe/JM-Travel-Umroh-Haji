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

// Kedalaman targetId di bawah atasanId (0 = dirinya sendiri, 1 = rekrutan
// langsung/Gen1, dst), atau null kalau target bukan downline atasan.
// Dipakai membatasi data jaringan per generasi (lihat filterDataGenerasi).
export async function kedalamanDownline(pool, atasanId, targetId) {
  if (String(atasanId) === String(targetId)) return 0;
  let cur = targetId;
  for (let depth = 1; cur && depth <= 25; depth++) {
    const [[r]] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [cur]);
    const next = r?.perekrut_id;
    if (!next) return null;
    if (String(next) === String(atasanId)) return depth;
    cur = next;
  }
  return null;
}

// Aturan data jaringan yang boleh dilihat anggota Sahabat biasa (dikonfirmasi
// user 2026-10-01, "SAHABAT" di catatan sistem ujroh) — DIPAKSA DI SERVER:
//   Gen1   : nama, no. telepon, progres
//   Gen2-5 : nama lengkap, progres (tanpa telepon)
//   Gen6+  : jumlah saja (baris & nama tidak dikirim sama sekali)
// Admin/super_admin & Head of Program tidak lewat filter ini.
export const GEN_MAKS_DETAIL = 5;

// Persetujuan data pribadi (dikonfirmasi user 2026-10-02): anggota yang BELUM
// menyetujui (users.setuju_data_pribadi_at NULL) tidak ditampilkan nama, no.
// telepon, maupun progresnya ke upline — cuma posisi & status di jaringan.
// Dipakai /api/sahabat/team & /api/sahabat/downline untuk penampil anggota biasa.
export function samarkanTanpaPersetujuan(row) {
  const setuju = !!row.setuju_data_pribadi_at;
  delete row.setuju_data_pribadi_at;
  if (setuju) return row;
  delete row.wa;
  return { ...row, name: 'Anggota (belum menyetujui berbagi data)', persen_kesiapan: null, data_disembunyikan: true };
}
