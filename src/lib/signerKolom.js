// Kolom `pengaturan` yang dipakai buat signer institusi (PIHAK JM Travel)
// tiap jenis dokumen. Default-nya semua dokumen 2-pihak+ reuse penandatangan
// umum (nama_penandatangan/jabatan_penandatangan).
//
// Dipakai bareng oleh pasalUntukCetak.js, pasalSnapshot.js, dan
// api/admin/pasal/route.js — JANGAN duplikat map ini di 3 tempat itu (ini
// persis pola bug "3 tempat harus sinkron" yang sudah beberapa kali
// kejadian di dokumen legal sahabat, lihat memori proyek).
//
// jamaah (SPJ) & spk_ak (SPK-AK) SEKARANG punya penandatangan Management
// KHUSUS masing-masing (dikonfirmasi user 2026-09-09 — boleh beda orang
// dari Penandatangan Umum SPK-PWK), bukan reuse DEFAULT_KOLOM lagi.
const KOLOM_SIGNER = {
  jamaah: { nama: 'nama_penandatangan_jamaah', jabatan: 'jabatan_penandatangan_jamaah' },
  spk_ak: { nama: 'nama_penandatangan_spk_ak', jabatan: 'jabatan_penandatangan_spk_ak' },
};

const DEFAULT_KOLOM = { nama: 'nama_penandatangan', jabatan: 'jabatan_penandatangan' };

export function kolomSignerUntuk(dokumen) {
  return KOLOM_SIGNER[dokumen] || DEFAULT_KOLOM;
}

// SK-CIF (Surat Kuasa Kerjasama Multi CIF) — Penerima Kuasa punya
// penandatangan SENDIRI (Nama+No.Identitas+Jabatan), TERPISAH dari
// Penandatangan Umum/SPJ/SPK-AK dan BUKAN Head of Program (asumsi awal
// SALAH — dikoreksi 2026-09-10 setelah dicocokkan ke file final user,
// "Surat Kuasa CIF.docx": Penerima Kuasa di situ "Muhammad Zaki / Direktur
// Utama", bukan siapapun yang lagi jadi Head of Program). Butuh NIK juga
// (identitas Penerima Kuasa di dokumen), makanya gak lewat
// kolomSignerUntuk() biasa yang cuma pasangan nama+jabatan.
export async function ambilSignerSkCif(pool) {
  const [[pengaturan]] = await pool.query(
    'SELECT nama_penandatangan_sk_cif, nik_penandatangan_sk_cif, jabatan_penandatangan_sk_cif FROM pengaturan WHERE id = 1'
  );
  if (!pengaturan?.nama_penandatangan_sk_cif) return null;
  return {
    nama: pengaturan.nama_penandatangan_sk_cif,
    nik: pengaturan.nik_penandatangan_sk_cif,
    jabatan: pengaturan.jabatan_penandatangan_sk_cif,
  };
}
