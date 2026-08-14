import pool from '@/lib/db';
import { cekItemPerluDipesan } from '@/lib/perlengkapan';
import { kirimNotifikasiSuperAdmin } from '@/lib/notifikasi';

// notifications.pesan VARCHAR(500) — ringkasan cuma nama item (bukan alasan
// lengkap per item, itu udah kelihatan di badge merah /admin/perlengkapan),
// dipotong kalau kepanjangan biar gak pernah kena "Data too long".
const BATAS_PESAN = 480;

// Sweep harian: cek item perlengkapan yang perlu dipesan ulang, kirim SATU
// notifikasi ringkasan (bukan per-item, biar gak spam) ke super_admin saja.
// Dipanggil dari src/instrumentation.js — pola sama seperti
// jalankanClosingOtomatis() di src/lib/closing-otomatis.js.
export async function jalankanCekStokPerlengkapan() {
  const perluDipesan = await cekItemPerluDipesan(pool);
  if (perluDipesan.length === 0) return { perluDipesan: [] };

  let daftar = perluDipesan.map(it => `${it.nama} (stok ${it.stok_saat_ini})`).join(', ');
  if (daftar.length > BATAS_PESAN) daftar = `${daftar.slice(0, BATAS_PESAN - 3)}...`;

  await kirimNotifikasiSuperAdmin(pool, {
    tipe: 'perlengkapan_perlu_dipesan',
    judul: `${perluDipesan.length} Item Perlengkapan Perlu Dipesan Ulang`,
    pesan: daftar,
    link: '/admin/perlengkapan',
  });

  console.log(`[perlengkapan-stok-otomatis] ${perluDipesan.length} item perlu dipesan:`, perluDipesan.map(i => i.nama));
  return { perluDipesan };
}
