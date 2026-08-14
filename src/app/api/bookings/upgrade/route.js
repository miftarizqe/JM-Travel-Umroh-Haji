import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];

function kamarKey(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('double')) return 'double';
  return 'triple';
}
function kamarLabel(key) {
  return key === 'quad' ? 'Quad' : key === 'double' ? 'Double' : 'Triple';
}

// Harga per jamaah untuk kombinasi paket+kamar (pakai harga perwakilan kalau booking via perwakilan)
async function hargaPerJamaah(prog, paket, kamarK, referral_perw_id, prog_id) {
  const hargaKey = `harga_${paket}_${kamarK}`;
  let harga = Number(prog[hargaKey] || prog[`harga_${paket}`] || 0);
  if (referral_perw_id) {
    const [ph] = await pool.query(
      'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?',
      [referral_perw_id, prog_id]
    );
    if (ph.length > 0) {
      const jual = ph[0][`jual_${paket}_${kamarK}`];
      if (jual && Number(jual) > 0) harga = Number(jual);
    }
  }
  return harga;
}

// GET /api/bookings/upgrade?booking_id=xxx
// Kembalikan opsi upgrade (kombinasi yang lebih mahal dari sekarang) + selisih.
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');
    if (!bookingId) return Response.json({ error: 'booking_id wajib diisi' }, { status: 400 });

    const [rows] = await pool.query(
      `SELECT b.*, p.name AS prog_nama,
              p.harga_deluxe_quad, p.harga_deluxe_triple, p.harga_deluxe_double,
              p.harga_eksekutif_quad, p.harga_eksekutif_triple, p.harga_eksekutif_double,
              p.harga_signature_quad, p.harga_signature_triple, p.harga_signature_double,
              p.harga_deluxe, p.harga_eksekutif, p.harga_signature
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.id = ?`, [bookingId]
    );
    if (rows.length === 0) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    const b = rows[0];

    // Tidak boleh upgrade kalau sudah lunas / selesai
    const bisaUpgrade = b.pelunasan_status !== 'paid' && b.status !== 'selesai';

    const jml = b.jumlah_jamaah || 1;
    const curPaket = String(b.paket || 'deluxe').toLowerCase();
    const curKamar = kamarKey(b.kamar);
    const curHargaJamaah = await hargaPerJamaah(b, curPaket, curKamar, b.referral_perw_id, b.prog_id);
    const curTotal = curHargaJamaah * jml;

    // Semua kombinasi + selisih
    const opsi = [];
    for (const paket of PAKET) {
      for (const kamar of KAMAR) {
        const hj = await hargaPerJamaah(b, paket, kamar, b.referral_perw_id, b.prog_id);
        const total = hj * jml;
        const selisih = total - curTotal;
        opsi.push({
          paket, kamar, kamar_label: kamarLabel(kamar),
          harga_per_jamaah: hj, total,
          selisih,
          is_current: paket === curPaket && kamar === curKamar,
          bisa_pilih: selisih > 0, // hanya upgrade (lebih mahal)
        });
      }
    }

    return Response.json({
      booking: {
        id: b.id, prog_name: b.prog_nama || b.prog_name,
        paket: curPaket, kamar: curKamar, kamar_label: kamarLabel(curKamar),
        jumlah_jamaah: jml, total_sekarang: curTotal,
        pelunasan_status: b.pelunasan_status, status: b.status,
      },
      bisa_upgrade: bisaUpgrade,
      opsi,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/bookings/upgrade  body: { booking_id, paket, kamar }
// Terapkan upgrade: update paket, kamar, total_harga. Hanya boleh naik (selisih > 0).
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { booking_id, paket, kamar } = await request.json();
    if (!booking_id || !paket || !kamar) {
      return Response.json({ error: 'booking_id, paket, dan kamar wajib diisi' }, { status: 400 });
    }
    const paketL = String(paket).toLowerCase();
    const kamarK = kamarKey(kamar);
    if (!PAKET.includes(paketL) || !KAMAR.includes(kamarK)) {
      return Response.json({ error: 'Paket / kamar tidak valid' }, { status: 400 });
    }

    const [rows] = await pool.query(
      `SELECT b.*, 
              p.harga_deluxe_quad, p.harga_deluxe_triple, p.harga_deluxe_double,
              p.harga_eksekutif_quad, p.harga_eksekutif_triple, p.harga_eksekutif_double,
              p.harga_signature_quad, p.harga_signature_triple, p.harga_signature_double,
              p.harga_deluxe, p.harga_eksekutif, p.harga_signature
       FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
       WHERE b.id = ?`, [booking_id]
    );
    if (rows.length === 0) return Response.json({ error: 'Booking tidak ditemukan' }, { status: 404 });
    const b = rows[0];

    if (b.pelunasan_status === 'paid' || b.status === 'selesai') {
      return Response.json({ error: 'Booking sudah lunas/selesai, tidak bisa upgrade' }, { status: 400 });
    }

    const jml = b.jumlah_jamaah || 1;
    const curHargaJamaah = await hargaPerJamaah(b, String(b.paket||'deluxe').toLowerCase(), kamarKey(b.kamar), b.referral_perw_id, b.prog_id);
    const curTotal = curHargaJamaah * jml;
    const newHargaJamaah = await hargaPerJamaah(b, paketL, kamarK, b.referral_perw_id, b.prog_id);
    const newTotal = newHargaJamaah * jml;
    const selisih = newTotal - curTotal;

    if (selisih <= 0) {
      return Response.json({ error: 'Upgrade harus ke paket/kamar yang lebih tinggi (bayar selisih).' }, { status: 400 });
    }

    await pool.query(
      'UPDATE bookings SET paket = ?, kamar = ?, total_harga = ? WHERE id = ?',
      [paketL, kamarLabel(kamarK), newTotal, booking_id]
    );

    return Response.json({
      message: `Upgrade berhasil! Selisih Rp ${selisih.toLocaleString('id-ID')} ditambahkan ke total. Bayar saat pelunasan.`,
      total_baru: newTotal, selisih,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
