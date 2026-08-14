// Jejak audit approval admin — siapa, kapan, ngapain, ke target apa.
// `conn` boleh pool atau connection transaksi, sama seperti src/lib/notifikasi.js.

export async function catatAudit(conn, { actor, aksi, target_type, target_id, keterangan }) {
  if (!actor?.id) return;
  await conn.query(
    `INSERT INTO audit_log (actor_id, actor_nama, aksi, target_type, target_id, keterangan)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actor.id, actor.name || null, aksi, target_type, String(target_id), keterangan || null]
  );
}
