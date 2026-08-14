// Simpan buffer PDF ke disk, pola sama dengan upload dokumen fisik lain
// (public/uploads/..., lihat src/app/api/admin/upload-ktp-fisik/route.js) —
// dipakai buat nyimpen pdf_awal_path/pdf_bermaterai_path/pdf_final_path di
// dokumen_signature.
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function simpanPdfDokumenSignature(buffer, { dokumen, refId, tahap }) {
  const dir = path.join(process.cwd(), 'public', 'uploads', 'dokumen-signature');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const nama = `${dokumen}_${refId}_${tahap}_${Date.now()}.pdf`;
  await writeFile(path.join(dir, nama), buffer);
  return `/uploads/dokumen-signature/${nama}`;
}

export function logoAbsolutePath() {
  return path.join(process.cwd(), 'public', 'logo', 'jm-travel-logo.png');
}
