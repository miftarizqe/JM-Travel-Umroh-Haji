import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// GET /api/admin/invoice-kwitansi/[id] — detail 1 dokumen buat halaman cetak.
// Ikut sertakan data booking (kalau ada) buat konteks tambahan di cetakan
// (program, paket, kamar) — dokumen manual tanpa booking_id ya cuma null.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[dokumen]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [id]);
    if (!dokumen) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });

    // Tanda Terima Uang nempel ke 1 payment spesifik — ambil tipe pembayaran
    // (dp/lunas) buat ditampilin di cetakan ("Pembayaran diterima — DP", dst).
    let payment = null;
    if (dokumen.payment_id) {
      const [[p]] = await pool.query('SELECT type FROM payments WHERE id = ?', [dokumen.payment_id]);
      payment = p || null;
    }

    let booking = null;
    if (dokumen.booking_id) {
      // Join programs (tanggal_berangkat) — booking sendiri gak nyimpen
      // tanggal keberangkatan, itu atributnya program. jamaah_data di-parse
      // di sini biar halaman cetak gak perlu urus JSON.parse lagi.
      const [[b]] = await pool.query(
        `SELECT b.id, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.total_harga, b.dp_amount, b.jamaah_data,
                b.opsi_tambahan_data, b.opsi_tambahan_total,
                p.tanggal_berangkat
         FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
         WHERE b.id = ?`,
        [dokumen.booking_id]
      );
      if (b) {
        // jamaah_data kolomnya bertipe JSON asli di MySQL — mysql2 udah
        // auto-parse jadi array, BUKAN string, jadi jangan JSON.parse() lagi
        // (kalau dipaksa, selalu gagal diam2 krn JSON.parse ekspektasi
        // string, bukan array — itu penyebab nama jamaah kemarin gak muncul).
        // Tetap jaga2 kalau suatu saat driver balikin string juga.
        let jamaahNama = [];
        try {
          const parsed = typeof b.jamaah_data === 'string' ? JSON.parse(b.jamaah_data || '[]') : b.jamaah_data;
          jamaahNama = (Array.isArray(parsed) ? parsed : []).map(j => j.nama).filter(Boolean);
        } catch { jamaahNama = []; }

        // Opsi tambahan (addon di luar paket dasar) — kalau ada isinya,
        // dipakai sbg baris "item lain" tambahan di halaman cetak, format
        // sama kayak baris Paket.
        let opsiTambahanNama = [];
        try {
          const parsedOpsi = typeof b.opsi_tambahan_data === 'string' ? JSON.parse(b.opsi_tambahan_data || '[]') : b.opsi_tambahan_data;
          opsiTambahanNama = (Array.isArray(parsedOpsi) ? parsedOpsi : []).map(o => o.nama).filter(Boolean);
        } catch { opsiTambahanNama = []; }

        // Tanggal DP dibayar — dipakai di Invoice Pelunasan biar jelas
        // "DP sudah dibayar tanggal berapa", bukan cuma nominalnya doang.
        const [[bayarDp]] = await pool.query(
          `SELECT created_at FROM payments WHERE booking_id = ? AND type = 'dp' AND status = 'confirmed'
           ORDER BY created_at DESC LIMIT 1`,
          [dokumen.booking_id]
        );

        // Sisa Pembayaran = total_harga - SEMUA invoice (jenis 'invoice') yang
        // pernah digenerate buat booking ini, TERMASUK dokumen ini sendiri —
        // "sisa tagihan", bukan "sisa yang belum beneran dibayar" (itu udah
        // dicover Tanda Terima/Kwitansi yang narik dari payments asli).
        let sisaPembayaran = null;
        if (dokumen.jenis === 'invoice') {
          const [[{ totalInvoiced }]] = await pool.query(
            `SELECT COALESCE(SUM(nominal), 0) AS totalInvoiced FROM invoice_kwitansi
             WHERE booking_id = ? AND jenis = 'invoice'`,
            [dokumen.booking_id]
          );
          sisaPembayaran = Number(b.total_harga || 0) - Number(totalInvoiced);
        }

        booking = {
          ...b, jamaah_data: undefined, jamaah_nama: jamaahNama,
          opsi_tambahan_data: undefined, opsi_tambahan_nama: opsiTambahanNama,
          dp_dibayar_tanggal: bayarDp?.created_at || null,
          sisa_pembayaran: sisaPembayaran,
        };
      }
    }

    return Response.json({ dokumen, booking, payment });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
