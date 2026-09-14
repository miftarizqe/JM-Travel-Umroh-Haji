import { wajibRole } from '@/lib/auth';
import { masterHotelService as service } from './service';

// CRUD Master Hotel (kota + bintang + nama hotel) — super_admin only. Ini
// ENTITAS INDUK, banyak periode-rate nempel di bawahnya (lihat
// master-hotel-periode/route.js) — beda dari dulu (`master_hotel_rate`
// flat, 1 baris = 1 hotel + 1 rate + 1 periode), sekarang 1 hotel bisa
// punya banyak periode tanpa ngetik ulang nama hotelnya (dikonfirmasi user
// 2026-08-18).
//
// File ini cuma "controller" (baca request, panggil service, bentuk
// response HTTP) — logic bisnis ada di service.js, query SQL di
// repository.js.

function responsError(error) {
  if (error.status) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
}

// GET /api/admin/master-hotel                    -> semua (termasuk nonaktif), nested periode[]
// GET /api/admin/master-hotel?kota=mekkah         -> filter kota, cuma aktif
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const hotel = await service.daftar({ kota: searchParams.get('kota') });
    return Response.json({ hotel });
  } catch (error) {
    return responsError(error);
  }
}

// POST /api/admin/master-hotel
// body: { kota, bintang, nama_hotel, urutan? }
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const id = await service.tambah(await request.json());
    return Response.json({ message: 'Hotel tersimpan!', id }, { status: 201 });
  } catch (error) {
    return responsError(error);
  }
}

// PUT /api/admin/master-hotel
// body: { id, kota?, bintang?, nama_hotel?, urutan?, aktif? }
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, ...data } = await request.json();
    await service.ubah(id, data);
    return Response.json({ message: 'Hotel diperbarui!' });
  } catch (error) {
    return responsError(error);
  }
}

// DELETE /api/admin/master-hotel?id=xxx — ikut hapus semua periode di
// bawahnya (gak ada FK constraint di skema ini, jadi dibersihin manual).
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    await service.hapus(searchParams.get('id'));
    return Response.json({ message: 'Hotel dihapus!' });
  } catch (error) {
    return responsError(error);
  }
}
