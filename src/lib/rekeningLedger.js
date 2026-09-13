// Pencatatan 3 rekening JM Travel — lihat migration-rekening-ledger.sql buat
// penjelasan lengkap tiap rekening. Helper ini SENGAJA gak nge-throw kalau
// gagal — pemanggilnya (approve payment, confirm TF) udah nyelesein
// transaksi utamanya duluan, insert ledger ini efek samping pencatatan aja,
// jangan sampai gagal-nya bikin approve/confirm asli ikut gagal.
export async function catatRekening(conn, { rekening, jenis, sumber_tipe, sumber_id, nominal, keterangan }) {
  if (!nominal || nominal <= 0) return;
  try {
    await conn.query(
      `INSERT INTO rekening_ledger (rekening, jenis, sumber_tipe, sumber_id, nominal, keterangan)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rekening, jenis, sumber_tipe, sumber_id != null ? String(sumber_id) : null, nominal, keterangan || null]
    );
  } catch (e) {
    console.error('Gagal catat rekening_ledger:', e);
  }
}
