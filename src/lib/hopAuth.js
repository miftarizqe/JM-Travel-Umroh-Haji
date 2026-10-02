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
