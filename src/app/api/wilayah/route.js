const BASE = 'https://www.emsifa.com/api-wilayah-indonesia/api';
const PATH = {
  provinsi: () => 'provinces.json',
  kota: (parentId) => `regencies/${parentId}.json`,
  kec: (parentId) => `districts/${parentId}.json`,
  kel: (parentId) => `villages/${parentId}.json`,
};

// GET /api/wilayah?level=provinsi|kota|kec|kel&parent_id=X — proxy data
// wilayah administratif Indonesia dari emsifa/api-wilayah-indonesia (JSON
// statis, gratis, gak perlu API key) buat dropdown alamat berjenjang Provinsi
// -> Kota/Kabupaten -> Kecamatan -> Kelurahan (dikonfirmasi user 2026-10-06,
// lihat AddressFields.jsx). Diproxy lewat server (bukan client fetch langsung
// ke emsifa) biar gak nambah domain pihak ketiga di CSP browser, dan
// responsnya numpang fetch cache Next.js — data wilayah administratif
// praktis gak pernah berubah, revalidate 30 hari cukup longgar.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level');
  const parentId = searchParams.get('parent_id');
  const buildPath = PATH[level];
  if (!buildPath) return Response.json({ error: 'level tidak valid' }, { status: 400 });
  if (level !== 'provinsi' && !parentId) return Response.json({ items: [] });

  try {
    const res = await fetch(`${BASE}/${buildPath(parentId)}`, { next: { revalidate: 60 * 60 * 24 * 30 } });
    if (!res.ok) return Response.json({ error: 'Gagal mengambil data wilayah' }, { status: 502 });
    const data = await res.json();
    const items = data.map(d => ({ id: d.id, name: d.name }));
    return Response.json({ items });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Gagal mengambil data wilayah' }, { status: 502 });
  }
}
