import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { teruskanKeGo } from '@/lib/teruskanKeGo';

// GET /api/programs dilayani jm-travel-api (Go) — Caddy @go_programs (Caddyfile.tahap2). Di
// dev/prod GET tidak pernah sampai ke sini; handler ini cuma meneruskan ke GO_API_URL saat
// `next dev` lokal. Logika listing lama (sembunyikan program yang sudah berangkat, harga custom
// perwakilan, target_sudah_checkout Sahabat) ada di riwayat git file ini (638047c) dan BELUM
// di-porting ke Go.
export const GET = teruskanKeGo;

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