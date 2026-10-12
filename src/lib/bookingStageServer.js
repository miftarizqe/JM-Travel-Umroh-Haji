// Lampirkan field yang dibutuhin getStage() (src/lib/bookingStage.js) ke
// baris booking dari endpoint mana pun — biar bar progres admin persis sama
// dengan yang dilihat jamaah (dikonfirmasi user 2026-10-12):
//   - prog_publish_type (program eksklusif Sahabat gak punya tahap Perjanjian)
//   - perjanjian_sig { id, fase, metode } (TTD digital Perjanjian Jamaah)
// perjanjian_scan_path diambil dari baris bookings itu sendiri (b.*).
export async function lampirkanInfoStage(pool, bookings) {
  const list = (bookings || []).filter(Boolean);
  if (list.length === 0) return bookings;
  const ids = list.map(b => b.id);
  const ph = ids.map(() => '?').join(',');

  const [progRows] = await pool.query(
    `SELECT b.id, p.publish_type, b.perjanjian_scan_path, b.setuju_pks
     FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id WHERE b.id IN (${ph})`, ids);
  const progMap = new Map(progRows.map(r => [String(r.id), r]));

  const [sigRows] = await pool.query(
    `SELECT ref_id, id, fase, metode FROM dokumen_signature WHERE dokumen = 'jamaah' AND ref_id IN (${ph})`, ids);
  const sigMap = new Map(sigRows.map(r => [String(r.ref_id), { id: r.id, fase: r.fase, metode: r.metode }]));

  for (const b of list) {
    const info = progMap.get(String(b.id));
    if (b.prog_publish_type === undefined) b.prog_publish_type = info?.publish_type || null;
    if (b.perjanjian_scan_path === undefined) b.perjanjian_scan_path = info?.perjanjian_scan_path || null;
    if (b.setuju_pks === undefined) b.setuju_pks = info?.setuju_pks ?? null;
    if (b.perjanjian_sig === undefined) b.perjanjian_sig = sigMap.get(String(b.id)) || null;
  }
  return bookings;
}
