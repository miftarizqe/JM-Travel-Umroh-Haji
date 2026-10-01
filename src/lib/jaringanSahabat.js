// Jumlah relasi tiap sahabat per generasi (Gen1-Gen5) — dipakai dashboard
// Head of Program Sahabat (dikonfirmasi user 2026-10-01: "lihat total sahabat
// & jumlah relasi tiap sahabat, angka saja"). Gen dihitung lewat rantai
// users.perekrut_id; batas 5 level = batas ujroh (level > 5 tidak dapat).
//
// Relasi yang dihitung = sahabat AKTIF (sudah bayar regist & di-ACC — titik
// pemicu ujroh). Sahabat yang masih dalam proses pendaftaran tetap tampil di
// daftar (biar HoP bisa bantu cek datanya) tapi belum dihitung sebagai relasi.
export const GEN_MAKS = 5;

export async function relasiSemuaSahabat(pool) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.kode_unik, u.status, u.perekrut_id, u.created_at,
            sp.status AS status_pendaftaran
     FROM users u
     LEFT JOIN sahabat_pendaftaran sp ON sp.id = (
       SELECT MAX(sp2.id) FROM sahabat_pendaftaran sp2 WHERE sp2.user_id = u.id
     )
     WHERE u.role = 'sahabat_baitullah' AND u.status <> 'rejected'`
  );

  // anak langsung per perekrut — cuma anak yang AKTIF yang dihitung relasi
  const anakAktif = new Map();
  for (const r of rows) {
    if (!r.perekrut_id || r.status !== 'active') continue;
    if (!anakAktif.has(r.perekrut_id)) anakAktif.set(r.perekrut_id, []);
    anakAktif.get(r.perekrut_id).push(r.id);
  }

  return rows.map(r => {
    const gen = [];
    let level = [r.id];
    for (let g = 1; g <= GEN_MAKS; g++) {
      const berikut = level.flatMap(id => anakAktif.get(id) || []);
      gen.push(berikut.length);
      level = berikut;
    }
    return {
      id: r.id,
      name: r.name,
      kode_unik: r.kode_unik,
      status: r.status,
      status_pendaftaran: r.status_pendaftaran || null,
      created_at: r.created_at,
      gen,
      total: gen.reduce((a, b) => a + b, 0),
    };
  });
}
