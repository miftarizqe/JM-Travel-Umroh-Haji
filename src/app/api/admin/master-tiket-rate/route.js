import { wajibRole } from '@/lib/auth';
import { masterTiketRateService as service } from './service';

// CRUD Master Harga Tiket Pesawat — super_admin only (data biaya vendor,
// level akses sama kayak modul-negara/kalkulator-template). Sumber buat
// "Isi dari Master" di KalkulatorTerpadu.jsx — SNAPSHOT/copy doang, bukan
// live-link (lihat komentar sama di master-hotel-rate/route.js).
//
// File ini cuma "controller" — logic bisnis di service.js, query SQL di
// repository.js.

function responsError(error) {
  if (error.status) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
}

// GET /api/admin/master-tiket-rate            -> semua (termasuk nonaktif)
// GET /api/admin/master-tiket-rate?aktif=1    -> cuma yang aktif
export async function GET(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const rate = await service.daftar({ aktifSaja: searchParams.get('aktif') });
    return Response.json({ rate });
  } catch (error) {
    return responsError(error);
  }
}

// POST /api/admin/master-tiket-rate
// body: { nama_rute, kota_asal?, kota_tujuan?, rute?, negara_transit_id?, periode_mulai?, periode_selesai?, rate, mata_uang?, urutan? }
export async function POST(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const id = await service.tambah(await request.json());
    return Response.json({ message: 'Master tiket tersimpan!', id }, { status: 201 });
  } catch (error) {
    return responsError(error);
  }
}

// PUT /api/admin/master-tiket-rate
// body: { id, nama_rute?, kota_asal?, kota_tujuan?, rute?, negara_transit_id?, periode_mulai?, periode_selesai?, rate?, mata_uang?, urutan?, aktif? }
export async function PUT(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, ...data } = await request.json();
    await service.ubah(id, data);
    return Response.json({ message: 'Master tiket diperbarui!' });
  } catch (error) {
    return responsError(error);
  }
}

// DELETE /api/admin/master-tiket-rate?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['super_admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    await service.hapus(searchParams.get('id'));
    return Response.json({ message: 'Master tiket dihapus!' });
  } catch (error) {
    return responsError(error);
  }
}
