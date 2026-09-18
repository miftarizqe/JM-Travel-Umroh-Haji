import { wajibRole } from '@/lib/auth';
import { modulNegaraTierService as service } from './service';

// File ini cuma "controller" — logic bisnis di service.js, query SQL di
// repository.js.

function responsError(error) {
  if (error.status) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
}

// GET /api/admin/modul-negara-tier?modul_negara_id=X — daftar baris tier 1 modul
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const tiers = await service.daftar(searchParams.get('modul_negara_id'));
    return Response.json({ tiers });
  } catch (error) {
    return responsError(error);
  }
}

// PUT — ganti SELURUH baris tier 1 modul sekaligus (DELETE semua + bulk INSERT),
// pola yang sama kayak biaya_breakdown_item di biaya-breakdown/route.js.
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { modul_negara_id, tiers } = await request.json();
    await service.gantiSemua(modul_negara_id, tiers);
    return Response.json({ message: 'Tabel tier disimpan!' });
  } catch (error) {
    return responsError(error);
  }
}
