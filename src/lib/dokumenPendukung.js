// Dokumen pendukung jamaah (scan paspor/KK/KTP/vaksin/pas foto) + status
// verifikasi admin (dikonfirmasi user 2026-10-01). Dipakai FE (form-jamaah,
// dashboard jamaah, admin verifikasi) dan BE (PATCH /api/bookings/[id],
// /api/admin/dokumen-pendukung) biar aturannya satu sumber.
//
// Status disimpan DI DALAM objek tiap jamaah (jamaah_data[i].doc_status), bukan
// tabel terpisah — jadi ikut kebawa otomatis kalau urutan jamaah bergeser
// (mis. pembatalan per jamaah) & gak butuh migrasi skema. Bentuknya:
//   doc_status: { doc_paspor: { status, alasan, oleh, pada }, ... }
// Status HANYA ditentukan server: diunggah/diganti -> 'menunggu', admin ->
// 'diverifikasi' / 'ditolak'. Nilai doc_status kiriman client selalu diabaikan.

export const DOC_LIST = [
  { key: 'doc_paspor', jenis: 'paspor', label: 'Scan Paspor' },
  { key: 'doc_kk', jenis: 'kk', label: 'Kartu Keluarga' },
  { key: 'doc_ktp', jenis: 'ktp', label: 'KTP' },
  { key: 'doc_vaksin', jenis: 'vaksin', label: 'Bukti Vaksin Meningitis & Polio' },
  { key: 'doc_foto', jenis: 'foto', label: 'Pas Foto' },
];
export const DOC_KEYS = DOC_LIST.map(d => d.key);
export const labelDokumen = (key) => DOC_LIST.find(d => d.key === key)?.label || key;

export const STATUS_DOKUMEN = {
  menunggu: { label: 'Menunggu verifikasi', ikon: '⏳', cls: 'bg-yellow-100 text-yellow-700' },
  diverifikasi: { label: 'Terverifikasi', ikon: '✅', cls: 'bg-green-100 text-green-700' },
  ditolak: { label: 'Ditolak', ikon: '❌', cls: 'bg-red-100 text-red-600' },
};

// Status 1 dokumen buat ditampilkan: null kalau belum diunggah. Dokumen lama
// (diunggah sebelum fitur ini, belum punya doc_status) dianggap 'menunggu'.
export function statusDokumen(jamaah, key) {
  if (!jamaah?.[key]) return null;
  return jamaah.doc_status?.[key] || { status: 'menunggu' };
}

// BE: hitung ulang doc_status saat formulir disimpan. `lama` = jamaah_data yang
// tersimpan di DB, `baru` = kiriman client. Dicocokkan per index (urutan jamaah
// di form = urutan di DB). Dokumen yang path-nya sama dengan yang tersimpan
// mempertahankan status lamanya; yang baru/diganti jadi 'menunggu'; yang
// dikosongkan statusnya dibuang.
export function terapkanStatusDokumen(baru, lama) {
  if (!Array.isArray(baru)) return baru;
  const lamaArr = Array.isArray(lama) ? lama : [];
  return baru.map((j, i) => {
    if (!j || typeof j !== 'object') return j;
    const sebelum = lamaArr[i] || {};
    const doc_status = {};
    for (const key of DOC_KEYS) {
      if (!j[key]) continue;
      doc_status[key] = (j[key] === sebelum[key] && sebelum.doc_status?.[key])
        ? sebelum.doc_status[key]
        : { status: 'menunggu' };
    }
    return { ...j, doc_status };
  });
}
