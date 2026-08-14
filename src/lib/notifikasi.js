// Helper pengiriman notifikasi in-app.
// `conn` boleh pool (src/lib/db.js) atau connection transaksi (conn.beginTransaction()),
// keduanya punya .query() jadi bisa dipanggil dari dalam ataupun luar transaksi.

export async function kirimNotifikasi(conn, { user_id, tipe, judul, pesan, link }) {
  if (!user_id) return;
  await conn.query(
    `INSERT INTO notifications (user_id, tipe, judul, pesan, link) VALUES (?, ?, ?, ?, ?)`,
    [user_id, tipe, judul, pesan || null, link || null]
  );
}

// Broadcast ke semua akun admin — dipakai untuk event yang butuh perhatian admin
// (bukti transfer baru, pengajuan pembatalan, custom harga, dst).
// role IN ('admin','super_admin') — dulu cuma 'admin' doang, jadi begitu
// migration-super-admin-role.sql misahin super_admin jadi role sendiri
// (dulu cuma flag is_super_admin di atas role='admin'), broadcast ini diam2
// berhenti nyampe ke akun super_admin manapun (termasuk yang beneran
// dipakai sehari-hari) — notifikasi tetep ke-insert ke DB, cuma gak pernah
// ke user yang login sebagai super_admin.
export async function kirimNotifikasiAdmin(conn, { tipe, judul, pesan, link }) {
  const [admins] = await conn.query("SELECT id FROM users WHERE role IN ('admin', 'super_admin')");
  for (const a of admins) {
    await kirimNotifikasi(conn, { user_id: a.id, tipe, judul, pesan, link });
  }
}
