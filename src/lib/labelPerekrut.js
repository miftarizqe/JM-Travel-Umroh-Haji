// Label tampilan "siapa yang merekrut Anda" — perekrut admin/super_admin
// ATAU Head of Program disamarkan jadi "Management JM Travel" (dikonfirmasi user
// 2026-10-02, awalnya cuma diterapkan di daftar-sahabat & /api/referral-list/
// verify-invite, lalu ketauan daftar-perwakilan punya tampilan serupa yang
// ketinggalan — disatukan ke sini biar gak ada lagi tempat ketiga yang lupa).
// Perekrut sesama anggota (sahabat/perwakilan) tetap tampil nama aslinya.
export function labelPerekrut(profil, pengaturan) {
  if (!profil?.perekrut_id) return null;
  const isManagement = ['admin', 'super_admin', 'hop'].includes(profil.perekrut_role)
    || (pengaturan?.head_of_program_user_id && String(profil.perekrut_id) === String(pengaturan.head_of_program_user_id));
  if (isManagement) return 'Management JM Travel';
  return profil.perekrut_nama || null;
}
