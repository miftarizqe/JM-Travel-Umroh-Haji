import { wajibRole } from '@/lib/auth';
import { modulNegaraService as service } from './service';

// Modul negara dipakai BARENG lintas jenis program yang diizinkan
// (`boleh_modul_negara` di jenis_program_master, lihat
// KalkulatorTerpadu.jsx) — gak difilter per jenis_program di sini.
//
// File ini cuma "controller" — logic bisnis di service.js, query SQL di
// repository.js.

function responsError(error) {
  if (error.status) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
}

// GET /api/admin/modul-negara — default cuma yang aktif, ?semua=1 semua,
// ?full=1 sertakan tiers + addons (dipakai kalkulator buat resolve nominal
// item yg modul_negara_id-nya keisi).
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const modul = await service.daftar({
      semua: searchParams.get('semua') === '1',
      full: searchParams.get('full') === '1',
    });
    return Response.json({ modul });
  } catch (error) {
    return responsError(error);
  }
}

// POST — tambah modul negara baru
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const id = await service.tambah(await request.json());
    return Response.json({ message: 'Modul negara ditambahkan!', id });
  } catch (error) {
    return responsError(error);
  }
}

// PUT — update modul negara
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, ...data } = await request.json();
    await service.ubah(id, data);
    return Response.json({ message: 'Modul negara diperbarui!' });
  } catch (error) {
    return responsError(error);
  }
}

// DELETE ?id=X
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    await service.hapus(searchParams.get('id'));
    return Response.json({ message: 'Modul negara dihapus!' });
  } catch (error) {
    return responsError(error);
  }
}
