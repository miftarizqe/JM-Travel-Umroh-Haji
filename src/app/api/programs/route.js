import pool from '@/lib/db';
import { wajibRole, verifikasiToken } from '@/lib/auth';

// Listing publik — dipanggil tanpa login (pengunjung) maupun oleh
// jamaah/perwakilan yang login. Identitas pemanggil diambil dari token
// SENDIRI (bukan query params dari client — params role/perw_id lama gak
// pernah dikirim caller manapun & gampang dipalsuin kalau tetap dipercaya).
// publish_type='private' TIDAK PERNAH keluar dari sini apapun rolenya (cuma
// bisa didaftarin admin lewat panel admin). publish_type='perwakilan' cuma
// keluar buat perwakilan yang diotorisasi lewat program_perwakilan.
export async function GET(request) {
  try {
    const user = verifikasiToken(request);

    if (user?.role === 'perwakilan') {
      const [programs] = await pool.query(
        `SELECT p.* FROM programs p WHERE p.active = 1 AND (
           p.publish_type = 'public'
           OR (p.publish_type = 'perwakilan' AND EXISTS (
             SELECT 1 FROM program_perwakilan pp WHERE pp.program_id = p.id AND pp.perw_id = ?
           ))
         ) ORDER BY p.created_at DESC`,
        [user.id]
      );
      return Response.json({ programs });
    }

    // Admin/super_admin (dipakai a.l. oleh halaman Order Jamaah, admin bikinin
    // booking atas nama jamaah) — DULU jatuh ke cabang default di bawah
    // (cuma publish_type='public'), jadi Program yang dibuat khusus
    // perwakilan gak pernah nongol di sini walau adminnya sendiri yang
    // bikin. Admin butuh liat SEMUA program aktif apapun publish_type-nya,
    // gak boleh dibatasi kayak jamaah/perwakilan biasa.
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      const [programs] = await pool.query(
        "SELECT * FROM programs WHERE active = 1 ORDER BY created_at DESC"
      );
      return Response.json({ programs });
    }

    const [programs] = await pool.query(
      "SELECT * FROM programs WHERE active = 1 AND publish_type = 'public' ORDER BY created_at DESC"
    );
    return Response.json({ programs });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

export async function POST(request) {
  // Hanya admin yang boleh membuat program
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const {
      name, type, durasi, tanggal, total_seat, dp, hpp_perw,
      // Harga per kombinasi
      harga_deluxe_quad, harga_deluxe_triple, harga_deluxe_double,
      harga_eksekutif_quad, harga_eksekutif_triple, harga_eksekutif_double,
      harga_signature_quad, harga_signature_triple, harga_signature_double,
      // Ujroh per kombinasi
      ujroh_deluxe_quad, ujroh_deluxe_triple, ujroh_deluxe_double,
      ujroh_eksekutif_quad, ujroh_eksekutif_triple, ujroh_eksekutif_double,
      ujroh_signature_quad, ujroh_signature_triple, ujroh_signature_double,
      highlight, publish_type, perw_id
    } = body;

    if (!name || !dp) {
      return Response.json({ error: 'Field wajib tidak lengkap' }, { status: 400 });
    }

    // Harga legacy (ambil dari triple sebagai default)
    const harga_deluxe = harga_deluxe_triple || 0;
    const harga_eksekutif = harga_eksekutif_triple || 0;
    const harga_signature = harga_signature_triple || 0;
    const ujroh_deluxe = ujroh_deluxe_triple || 0;
    const ujroh_eksekutif = ujroh_eksekutif_triple || 0;
    const ujroh_signature = ujroh_signature_triple || 0;

    await pool.query(
      `INSERT INTO programs 
      (name, type, durasi, tanggal, total_seat, dp, hpp_perw,
      harga_deluxe, harga_eksekutif, harga_signature,
      ujroh_deluxe, ujroh_eksekutif, ujroh_signature,
      harga_deluxe_quad, harga_deluxe_triple, harga_deluxe_double,
      harga_eksekutif_quad, harga_eksekutif_triple, harga_eksekutif_double,
      harga_signature_quad, harga_signature_triple, harga_signature_double,
      ujroh_deluxe_quad, ujroh_deluxe_triple, ujroh_deluxe_double,
      ujroh_eksekutif_quad, ujroh_eksekutif_triple, ujroh_eksekutif_double,
      ujroh_signature_quad, ujroh_signature_triple, ujroh_signature_double,
      highlight, publish_type, perw_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, type, durasi, tanggal, total_seat||20, dp, hpp_perw||0,
      harga_deluxe, harga_eksekutif, harga_signature,
      ujroh_deluxe, ujroh_eksekutif, ujroh_signature,
      harga_deluxe_quad||0, harga_deluxe_triple||0, harga_deluxe_double||0,
      harga_eksekutif_quad||0, harga_eksekutif_triple||0, harga_eksekutif_double||0,
      harga_signature_quad||0, harga_signature_triple||0, harga_signature_double||0,
      ujroh_deluxe_quad||0, ujroh_deluxe_triple||0, ujroh_deluxe_double||0,
      ujroh_eksekutif_quad||0, ujroh_eksekutif_triple||0, ujroh_eksekutif_double||0,
      ujroh_signature_quad||0, ujroh_signature_triple||0, ujroh_signature_double||0,
      highlight||'', publish_type||'public', perw_id||null]
    );

    return Response.json({ message: 'Program berhasil ditambahkan!' }, { status: 201 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}