import pool from '@/lib/db';
import { wajibRole, verifikasiToken } from '@/lib/auth';
import { PAKET, BINTANG_PAKET } from '@/lib/hotelCustomPricing';

// Custom Hotel per Kota — jamaah pilih Bintang Mekkah & Madinah TERPISAH,
// diambil dari 3 paket (Deluxe/Eksekutif/Signature = Bintang 3/4/5) yang
// SUDAH ADA (dikonfirmasi user 2026-08-20, gak perlu data opsi terpisah
// lagi). `custom_hotel_tersedia` = admin sudah nyalain mode Margin Persen
// (satu-satunya cara harga kombinasi MIX bisa dihitung adil, lihat
// hitungHargaCustomHotelDenganDb) — margin_mode/persen/komisi_mode/persen
// sendiri TETAP di-strip (info margin internal, gak boleh ke client),
// cuma dipakai buat nentuin boolean ini. hotel_mekkah_{paket}/
// hotel_madinah_{paket} aman dibuka (nama hotel doang, bukan rate).
function stripProgramsUntukPublik(programs) {
  return programs.map(p => {
    const rest = { ...p };
    const marginPersenAktif = rest.margin_mode === 'persen';
    delete rest.margin_persen; delete rest.komisi_persen; delete rest.margin_mode; delete rest.komisi_mode;
    return {
      ...rest,
      custom_hotel_tersedia: marginPersenAktif,
      hotel_opsi: marginPersenAktif ? PAKET.map(pk => ({
        paket: pk, bintang: BINTANG_PAKET[pk],
        hotel_mekkah: p[`hotel_mekkah_${pk}`], hotel_madinah: p[`hotel_madinah_${pk}`],
      })) : [],
    };
  });
}

// Listing publik — dipanggil tanpa login (pengunjung) maupun oleh
// jamaah/perwakilan yang login. Identitas pemanggil diambil dari token
// SENDIRI (bukan query params dari client — params role/perw_id lama gak
// pernah dikirim caller manapun & gampang dipalsuin kalau tetap dipercaya).
// publish_type='private' cuma keluar buat: (a) admin/super_admin (lihat
// cabang di bawah), (b) jamaah yang ditunjuk admin lewat program_private_akun
// (dikonfirmasi user 2026-09-06 — sebelumnya blanket gak pernah keluar sama
// sekali, cuma bisa didaftarin admin). Anonim & role lain TETAP gak pernah
// liat. publish_type='perwakilan' cuma keluar buat perwakilan yang
// diotorisasi lewat program_perwakilan.
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
      return Response.json({ programs: stripProgramsUntukPublik(programs) });
    }

    // Jamaah Sahabat Baitullah (role=sahabat) — liat program publik biasa
    // (boleh di-closing-in buat jamaah lain) DITAMBAH program khusus
    // publish_type='sahabat_baitullah' (exclusive, cuma buat checkout diri sendiri —
    // guard-nya di src/lib/booking.js, bukan di sini). Role lain TIDAK
    // PERNAH liat publish_type='sahabat_baitullah' sama sekali, apapun kondisinya.
    if (user?.role === 'sahabat_baitullah') {
      const [programs] = await pool.query(
        `SELECT * FROM programs WHERE active = 1 AND publish_type IN ('public', 'sahabat_baitullah') ORDER BY created_at DESC`
      );
      return Response.json({ programs: stripProgramsUntukPublik(programs) });
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
      return Response.json({ programs: stripProgramsUntukPublik(programs) });
    }

    // Jamaah (login) — program publik DITAMBAH program 'private' yang
    // ditunjuk admin buat akun ini spesifik (dikonfirmasi user 2026-09-06 —
    // sebelumnya 'private' gak pernah keluar sama sekali ke jamaah manapun,
    // cuma bisa didaftarin admin langsung). Anonim (belum login) tetap cuma
    // publish_type='public'.
    if (user?.role === 'jamaah') {
      const [programs] = await pool.query(
        `SELECT p.* FROM programs p WHERE p.active = 1 AND (
           p.publish_type = 'public'
           OR (p.publish_type = 'private' AND EXISTS (
             SELECT 1 FROM program_private_akun ppa WHERE ppa.program_id = p.id AND ppa.user_id = ?
           ))
         ) ORDER BY p.created_at DESC`,
        [user.id]
      );
      return Response.json({ programs: stripProgramsUntukPublik(programs) });
    }

    const [programs] = await pool.query(
      "SELECT * FROM programs WHERE active = 1 AND publish_type = 'public' ORDER BY created_at DESC"
    );
    return Response.json({ programs: stripProgramsUntukPublik(programs) });

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