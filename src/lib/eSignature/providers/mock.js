// Adapter mock TTD digital — dipakai selama belum ada kontrak dengan
// provider tersertifikasi (Privy/Digisign/VIDA/TekenAja). "Kirim" langsung
// sukses (gak ada dokumen beneran terkirim ke mana pun), lalu penyelesaian
// dipicu manual lewat tombol admin/signer di UI (provider asli akan
// menggantikan trigger manual ini dengan webhook penerimaan status).
export async function kirim({ dokumen, refId, signer }) {
  return { providerRef: `MOCK-SIG-${Date.now()}`, status: 'ttd_menunggu' };
}

export async function selesaikan({ providerRef, signer }) {
  return { selesaiAt: new Date() };
}
