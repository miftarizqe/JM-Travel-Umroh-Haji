import pool from '@/lib/db';

// GET /api/galeri — PUBLIK, dipakai landing page section Dokumentasi.
// Dikelompokkan per batch_judul buat slideshow per keberangkatan. Konten
// Instagram lewat live feed SnapWidget, kegiatan/booth lewat /api/berita —
// bukan tanggung jawab endpoint ini lagi.
export async function GET() {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM galeri_foto WHERE tipe = 'keberangkatan' ORDER BY batch_tanggal DESC, id, urutan"
    );

    const batchMap = new Map();
    rows.forEach(r => {
      if (!batchMap.has(r.batch_judul)) {
        batchMap.set(r.batch_judul, { judul: r.batch_judul, tanggal: r.batch_tanggal, foto: [] });
      }
      batchMap.get(r.batch_judul).foto.push(r.foto_path);
    });

    return Response.json({ batches: Array.from(batchMap.values()) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
