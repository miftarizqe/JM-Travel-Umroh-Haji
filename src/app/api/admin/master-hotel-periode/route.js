import { wajibRole } from '@/lib/auth';
import { masterHotelPeriodeService as service } from './service';

// CRUD Periode-Rate per Master Hotel — super_admin only. Anak dari
// master_hotel (lihat master-hotel/route.js) — 1 hotel bisa punya banyak
// baris di sini, 1 per periode harga (mis. Ramadan vs low-season), biar
// nambah periode baru gak perlu bikin ulang hotelnya.
//
// File ini cuma "controller" — logic bisnis di service.js, query SQL di
// repository.js.

function responsError(error) {
  if (error.status) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
}

// POST /api/admin/master-hotel-periode
// body: { master_hotel_id, periode_mulai?, periode_selesai?, berlaku_sampai?, rate_double, rate_triple, rate_quad, mata_uang?, urutan? }
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const id = await service.tambah(await request.json());
    return Response.json({ message: 'Periode tersimpan!', id }, { status: 201 });
  } catch (error) {
    return responsError(error);
  }
}

// PUT /api/admin/master-hotel-periode
// body: { id, periode_mulai?, periode_selesai?, berlaku_sampai?, rate_double?, rate_triple?, rate_quad?, mata_uang?, urutan? }
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, ...data } = await request.json();
    await service.ubah(id, data);
    return Response.json({ message: 'Periode diperbarui!' });
  } catch (error) {
    return responsError(error);
  }
}

// DELETE /api/admin/master-hotel-periode?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    await service.hapus(searchParams.get('id'));
    return Response.json({ message: 'Periode dihapus!' });
  } catch (error) {
    return responsError(error);
  }
}
