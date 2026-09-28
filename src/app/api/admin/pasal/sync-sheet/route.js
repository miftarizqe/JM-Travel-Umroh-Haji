import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { syncPasalDariSheet } from '@/lib/pasalGoogleSheet';

// POST /api/admin/pasal/sync-sheet — tarik isi pasal terbaru dari Google
// Sheets (lihat src/lib/pasalGoogleSheet.js buat format kolom & syarat env).
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;

  try {
    const hasil = await syncPasalDariSheet();
    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'pasal_sync_sheet',
      target_type: 'dokumen_pasal',
      target_id: 'google_sheet',
      keterangan: `Sync dari Google Sheets: ${hasil.ringkasan.map(r => `${r.dokumen}=${r.jumlah} pasal`).join(', ') || 'tidak ada baris valid'}`,
    });
    return Response.json(hasil);
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
