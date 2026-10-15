import { verifikasiToken } from './auth.js';

// Head of Program (HoP) = MANAGEMENT, role 'hop', di bawah admin (dikonfirmasi
// user 2026-10-03) — BUKAN lagi anggota Sahabat Baitullah yang ditunjuk.
// pengaturan.head_of_program_user_id tetap dipakai, tapi cuma untuk menentukan
// siapa penerima jatah HoP per pendaftaran Sahabat (lihat
// status-pendaftaran-sahabat), bukan untuk hak akses.
//
// HoP boleh LIHAT semua yang admin lihat di bagian Sahabat Baitullah, TAPI
// GAK BOLEH ACTION apa pun. Helper ini CUMA dipakai di endpoint GET/read-only.
// Endpoint yang nulis/aksi (POST/PUT/PATCH/DELETE) TETAP pakai
// wajibRole/wajibSuperAdmin biasa — JANGAN pernah diganti helper ini.
export async function wajibAdminAtauHopSahabat(request) {
  const user = verifikasiToken(request);
  if (!user) {
    return { error: Response.json({ error: 'Tidak terautentikasi. Silakan login terlebih dahulu.' }, { status: 401 }) };
  }
  if (['admin', 'super_admin'].includes(user.role)) return { user };
  if (isHopRole(user) && request.method === 'GET') return { user };
  return { error: Response.json({ error: 'Akses ditolak.' }, { status: 403 }) };
}

export function isHopRole(user) {
  return user?.role === 'hop';
}

// Versi wajibPemilikAtauAdmin (src/lib/auth.js) KHUSUS dipakai 3 endpoint
// "Riwayat Lengkap" sahabat (riwayat-saldo, payslip, dashboard?sahabat_id=).
// HoP SEMPAT dibolehin liat riwayat lengkap tabungan sahabat LAIN
// (dikonfirmasi user 2026-10-08), TAPI DICABUT (dikonfirmasi user
// 2026-10-15) -- rincian cashflow/tabungan mandiri orang lain bukan
// urusannya, cukup ringkasan ujroh-only (lihat
// /api/admin/sahabat/[userId]/ujroh-ringkasan, endpoint TERPISAH yang
// TETAP boleh dia akses). HoP SEKARANG cuma boleh akses data MILIKNYA
// SENDIRI di sini (sama kayak jamaah biasa) -- JANGAN dipakai gantiin
// wajibPemilikAtauAdmin biasa di endpoint non-sahabat (profil, perwakilan,
// dst), itu TETAP harus pakai versi original.
export async function wajibPemilikAtauAdminHopSahabat(request, pemilikId) {
  const user = verifikasiToken(request);
  if (!user) {
    return { error: Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 }) };
  }
  const boleh = ['admin', 'super_admin'].includes(user.role) || String(user.id) === String(pemilikId);
  if (!boleh) {
    return { error: Response.json({ error: 'Akses ditolak. Anda hanya bisa mengakses data milik sendiri.' }, { status: 403 }) };
  }
  return { user };
}

// Cuma ada 1 akun HoP system-wide (pengaturan.head_of_program_user_id) —
// "team HoP" = SELURUH downline Sahabat Baitullah-nya, rantai perekrut_id
// berjenjang (Gen1 s.d. seterusnya, bukan cuma rekrutan langsung),
// dikonfirmasi user 2026-10-12. Anggota di jaringan ini SENGAJA TIDAK BOLEH
// direkrut jadi Perwakilan (lihat 'rekrut_jadi_perwakilan' di
// /api/admin/users) — alasan bisnisnya di luar scope kode ini, aturan aja.
// Jalan NAIK dari userId (bukan BFS turun dari HoP) -- lebih murah buat
// ngecek 1 orang tertentu, gak perlu muat seluruh downline HoP yang bisa
// gede. Guard `visited` jaga-jaga siklus data kotor, walau perekrut_id
// seharusnya emang gak pernah muter balik.
export async function apakahBagianTeamHop(pool, userId) {
  const [[peng]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
  const hopId = peng?.head_of_program_user_id;
  if (!hopId || String(userId) === String(hopId)) return false;
  let current = userId;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const [[row]] = await pool.query('SELECT perekrut_id FROM users WHERE id = ?', [current]);
    if (!row?.perekrut_id) return false;
    if (String(row.perekrut_id) === String(hopId)) return true;
    current = row.perekrut_id;
  }
  return false;
}

// KHUSUS aksi milik HoP sendiri (dikonfirmasi user 2026-10-01): menandai
// "data bermasalah" + catatan ke admin. Ini satu-satunya "tulis" yang boleh
// dilakukan HoP, dan cuma ke tabel laporannya sendiri (sahabat_laporan_data)
// — HoP tetap TIDAK bisa mengubah data sahabat mana pun.
export async function wajibHopSahabat(request) {
  const user = verifikasiToken(request);
  if (!user) {
    return { error: Response.json({ error: 'Tidak terautentikasi. Silakan login terlebih dahulu.' }, { status: 401 }) };
  }
  if (isHopRole(user)) return { user };
  return { error: Response.json({ error: 'Hanya Head of Program yang bisa melakukan ini.' }, { status: 403 }) };
}
