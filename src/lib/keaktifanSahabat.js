// Aturan keaktifan ujroh Sahabat Baitullah (catatan sistem ujroh bagian D,
// detail dikonfirmasi user 2026-10-02):
//  - Sahabat tetap dapat ujroh selama masih mengajak orang baru: minimal
//    1 Gen1 AKTIF (sudah bayar registrasi & di-ACC) dalam setiap 6 bulan.
//  - Patokan = tanggal aktif Gen1 terakhir; kalau belum pernah mengajak,
//    patokannya tanggal akun dia sendiri aktif (masa awal 6 bulan).
//  - Lewat 6 bulan tanpa Gen1 baru: ujroh BARU berhenti masuk (jatahnya ke
//    Operasional Management); saldo yang sudah ada tidak terpengaruh.
//  - Akun yang statusnya bukan 'active' (mis. nonaktif) juga tidak dapat ujroh.
// Tanggal aktif diambil dari pendaftaran_status_log (status_baru = 'active').
export const BULAN_KEAKTIFAN = 6;

function tambahBulan(tgl, n) {
  const d = new Date(tgl);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * @returns {Promise<{ aktif: boolean, patokan: Date|null, berlaku_sampai: Date|null }>}
 */
export async function statusKeaktifanUjroh(conn, userId, sekarang = new Date()) {
  const [[r]] = await conn.query(
    `SELECT u.status,
            (SELECT MAX(l.created_at) FROM pendaftaran_status_log l JOIN users c ON c.id = l.user_id
              WHERE c.perekrut_id = u.id AND l.tipe = 'sahabat_baitullah' AND l.status_baru = 'active') AS gen1_terakhir,
            COALESCE(
              (SELECT MAX(l2.created_at) FROM pendaftaran_status_log l2
                WHERE l2.user_id = u.id AND l2.tipe = 'sahabat_baitullah' AND l2.status_baru = 'active'),
              u.created_at
            ) AS aktif_sendiri
     FROM users u WHERE u.id = ?`,
    [userId]
  );
  if (!r) return { aktif: false, patokan: null, berlaku_sampai: null };
  const kandidat = [r.gen1_terakhir, r.aktif_sendiri].filter(Boolean).map(t => new Date(t));
  const patokan = kandidat.length ? new Date(Math.max(...kandidat.map(d => d.getTime()))) : null;
  const berlakuSampai = patokan ? tambahBulan(patokan, BULAN_KEAKTIFAN) : null;
  const aktif = r.status === 'active' && !!berlakuSampai && sekarang <= berlakuSampai;
  return { aktif, patokan, berlaku_sampai: berlakuSampai };
}
