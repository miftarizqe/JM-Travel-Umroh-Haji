// Simpan buffer PDF ke disk — private-uploads/ (DI LUAR public/), satu-
// satunya jalan baca lewat /api/dokumen/dokumen-signature/<filename> (lihat
// resolveDokumenSignature di src/lib/dokumenProteksi.js) — dipakai buat
// nyimpen pdf_awal_path/pdf_bermaterai_path/pdf_final_path di
// dokumen_signature. Isinya PII lengkap (NIK, alamat, paspor, rekening,
// scan TTD+materai) jadi TIDAK BOLEH nangkring di public/uploads kayak
// upload dokumen umum lain — dikonfirmasi user 2026-09-11 (celah nyata,
// sempat sengaja ditunda pas migrasi 13 kategori dokumen pribadi lain
// 2026-09-03).
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function simpanPdfDokumenSignature(buffer, { dokumen, refId, tahap }) {
  const dir = path.join(process.cwd(), 'private-uploads', 'dokumen-signature');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const nama = `${dokumen}_${refId}_${tahap}_${Date.now()}.pdf`;
  await writeFile(path.join(dir, nama), buffer);
  return `/api/dokumen/dokumen-signature/${nama}`;
}

export function logoAbsolutePath() {
  return path.join(process.cwd(), 'public', 'logo', 'jm-travel-logo.png');
}
