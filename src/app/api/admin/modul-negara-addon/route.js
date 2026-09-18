import { wajibRole } from '@/lib/auth';
import { modulNegaraAddonService as service } from './service';

// File ini cuma "controller" — logic bisnis di service.js, query SQL di
// repository.js.

function responsError(error) {
  if (error.status) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
}

// GET /api/admin/modul-negara-addon?modul_negara_id=X — daftar addon 1 modul
// (semua, aktif & nonaktif — filter aktif dilakukan di sisi kalkulator, bukan di sini)
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const addons = await service.daftar(searchParams.get('modul_negara_id'));
    return Response.json({ addons });
  } catch (error) {
    return responsError(error);
  }
}

// PUT — ganti SELURUH addon 1 modul sekaligus (DELETE semua + bulk INSERT),
// pola yang sama kayak modul_negara_tier.
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { modul_negara_id, addons } = await request.json();
    await service.gantiSemua(modul_negara_id, addons);
    return Response.json({ message: 'Biaya tambahan disimpan!' });
  } catch (error) {
    return responsError(error);
  }
}
