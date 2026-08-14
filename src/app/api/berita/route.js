import pool from '@/lib/db';

// GET /api/berita — PUBLIK, feed berita & kegiatan buat landing page.
// Status "akan_datang" vs "sudah_berlangsung" DIHITUNG dari tanggal (bukan
// disimpan manual), jadi gak akan ketinggalan update begitu tanggalnya lewat.
export async function GET() {
  try {
    const [posts] = await pool.query('SELECT * FROM berita_kegiatan ORDER BY tanggal DESC, created_at DESC');
    const [fotoRows] = await pool.query("SELECT berita_id, foto_path FROM galeri_foto WHERE tipe = 'kegiatan' AND berita_id IS NOT NULL ORDER BY urutan, id");

    const fotoByBerita = new Map();
    fotoRows.forEach(f => {
      if (!fotoByBerita.has(f.berita_id)) fotoByBerita.set(f.berita_id, []);
      fotoByBerita.get(f.berita_id).push(f.foto_path);
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = posts.map(p => {
      const tglPost = p.tanggal ? new Date(p.tanggal) : null;
      const status = tglPost && tglPost >= today ? 'akan_datang' : 'sudah_berlangsung';
      return {
        id: p.id,
        judul: p.judul,
        deskripsi: p.deskripsi,
        tanggal: p.tanggal,
        status,
        foto: fotoByBerita.get(p.id) || [],
      };
    });

    return Response.json({ rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
