import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { ringkasanPaketKamar, resolveJamaahHarga } from '@/lib/jamaahHarga';
import { hitungJamaahBreakdownTtu, pastikanNomorDokumen } from '@/lib/invoiceKwitansi';
import { hitungSisaBayar } from '@/lib/pelunasan';

// Sama persis BATAS_MATERAI/butuhMaterai di halaman cetak
// (/admin/cetak-invoice/[id]/page.jsx) & POST .../setuju — JANGAN diubah
// sendiri2, kalau salah satu berubah yang lain ikut.
const BATAS_MATERAI = 5_000_000;

// GET /api/admin/invoice-kwitansi/[id] — detail 1 dokumen buat halaman cetak.
// Admin selalu boleh. Pemilik booking-nya (jamaah) JUGA boleh, HANYA kalau
// dokumennya udah terkirim (dikonfirmasi user 2026-10-13 — jamaah butuh
// lihat Tanda Terima Uang/Kwitansi/Invoice miliknya sendiri yang udah
// dikirim admin via "✅ Setuju", sebelumnya cuma bisa diakses admin sama
// sekali, bikin jamaah gak bisa lihat dokumennya meski udah terkirim).
// Dokumen tanpa booking_id (manual, gak nempel akun manapun) cuma admin.
// Ikut sertakan data booking (kalau ada) buat konteks tambahan di cetakan
// (program, paket, kamar) — dokumen manual tanpa booking_id ya cuma null.
export async function GET(request, { params }) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const [[dokumen]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [id]);
    if (!dokumen) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);

    // Nomor TTU/Kwitansi yang WAJIB materai dibakar PAS PERTAMA KALI admin
    // buka halaman cetak ini (dikonfirmasi user 2026-10-14) — dari titik
    // itu dokumennya udah bisa langsung diprint fisik, jadi nomornya harus
    // udah final SEBELUM itu kejadian (beda dari yang gak wajib materai,
    // nomornya baru dibakar pas tombol "Kirim ke Jamaah" diklik, lihat
    // POST .../setuju — gerbangnya sekarang checkbox "Nominal sudah benar",
    // dikonfirmasi user 2026-10-14). Idempotent — gak ngulang generate
    // kalau udah ada.
    if (isAdmin && ['tanda_terima', 'kwitansi'].includes(dokumen.jenis) && !dokumen.nomor) {
      const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || dokumen.status === 'paid';
      const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;
      if (butuhMaterai) {
        dokumen.nomor = await pastikanNomorDokumen(pool, dokumen);
      }
    }

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
        `SELECT b.id, b.user_id, b.ordered_by, b.prog_name, b.paket, b.kamar, b.jumlah_jamaah, b.total_harga, b.dp_amount, b.jamaah_data,
                b.opsi_tambahan_data, b.opsi_tambahan_total,
                p.tanggal_berangkat, u.wa AS pemesan_wa
         FROM bookings b LEFT JOIN programs p ON p.id = b.prog_id
                          LEFT JOIN users u ON u.id = COALESCE(b.ordered_by, b.user_id)
         WHERE b.id = ?`,
        [dokumen.booking_id]
      );

      // Akses: admin selalu boleh. Non-admin cuma boleh kalau dia pemilik
      // booking INI (user_id/ordered_by) DAN dokumennya udah terkirim —
      // sebelum terkirim, dokumen masih di tangan admin (preview/draft),
      // jamaah belum semestinya lihat (dikonfirmasi user 2026-10-13).
      if (!isAdmin) {
        const milikSendiri = b && (String(b.user_id) === String(auth.user.id) || String(b.ordered_by) === String(auth.user.id));
        if (!milikSendiri || !dokumen.terkirim) {
          return Response.json({ error: 'Akses ditolak.' }, { status: 403 });
        }
      }

      if (b) {
        // jamaah_data kolomnya bertipe JSON asli di MySQL — mysql2 udah
        // auto-parse jadi array, BUKAN string, jadi jangan JSON.parse() lagi
        // (kalau dipaksa, selalu gagal diam2 krn JSON.parse ekspektasi
        // string, bukan array — itu penyebab nama jamaah kemarin gak muncul).
        // Tetap jaga2 kalau suatu saat driver balikin string juga.
        let jamaahNama = [];
        let jamaahParsed = [];
        try {
          jamaahParsed = typeof b.jamaah_data === 'string' ? JSON.parse(b.jamaah_data || '[]') : b.jamaah_data;
          if (!Array.isArray(jamaahParsed)) jamaahParsed = [];
          jamaahNama = jamaahParsed.map(j => j.nama).filter(Boolean);
        } catch { jamaahNama = []; jamaahParsed = []; }

        // Dokumen ini rangkuman BOOKING (bukan per-orang) — kalau jamaah di
        // dalamnya sempat diedit sampai kamar/paket-nya beda-beda, label
        // paket/kamar tunggal jadi gak akurat lagi. Tampilkan "Campuran"
        // daripada nunjuk 1 kombo yang gak mewakili semua orang.
        const rpk = ringkasanPaketKamar({ ...b, jamaah_data: jamaahParsed });
        if (rpk.campuran) { b.paket = 'Campuran'; b.kamar = 'Campuran'; }

        // jamaah_breakdown = daftar {nama, paket, kamar, hargaJual} per
        // jamaah AKTIF (dibatalkan di-skip) — sumber tunggal buat halaman
        // cetak nampilin rincian PER ORANG kalau paket/kamar mereka beda-beda
        // (dikonfirmasi user 2026-10-14, "jangan ditulis campuran, rinci per
        // jamaah kalau emang beda"). resolveJamaahHarga ngasih kombo per
        // entry (eksplisit kalau pernah diedit admin, else fallback rata-rata
        // booking-level — sama logic yang dipakai ringkasanPaketKamar di atas).
        const jamaahBreakdown = jamaahParsed
          .filter(j => j?.status_jamaah !== 'dibatalkan')
          .map(j => {
            const r = resolveJamaahHarga({ ...b, jamaah_data: jamaahParsed }, j);
            return { nama: j.nama || '-', paket: r.paket, kamar: r.kamar, hargaJual: r.hargaJual };
          });

        // Breakdown khusus Tanda Terima Uang & Kwitansi — begitu dokumen
        // ini UDAH DIKIRIM, kontennya WAJIB diambil dari
        // jamaah_breakdown_snapshot yang dibekukan PERSIS pas tombol "Kirim
        // ke Jamaah" diklik (lihat POST .../setuju & migration 224) — TIDAK
        // dihitung ulang lagi, biar dokumen yang udah terkirim gak keliatan
        // "berubah" kalau booking-nya berubah belakangan (dikonfirmasi user
        // 2026-10-14, "kalo udah gue click kirim itu otomatis kelock").
        // Sebelum dikirim (masih preview/draft), dihitung LIVE via
        // hitungJamaahBreakdownTtu biar admin lihat data terkini.
        let jamaahBreakdownPembayaran = jamaahBreakdown;
        if (['tanda_terima', 'kwitansi'].includes(dokumen.jenis)) {
          if (dokumen.terkirim && dokumen.jamaah_breakdown_snapshot) {
            let snap = dokumen.jamaah_breakdown_snapshot;
            if (typeof snap === 'string') { try { snap = JSON.parse(snap); } catch { snap = null; } }
            if (Array.isArray(snap)) jamaahBreakdownPembayaran = snap;
          } else {
            jamaahBreakdownPembayaran = await hitungJamaahBreakdownTtu(pool, dokumen);
          }
        }

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

        // Sisa Pembayaran = sisa BENERAN yang belum dibayar (total_harga -
        // dp_amount - semua cicilan lunas confirmed, lihat hitungSisaBayar)
        // DIKURANGI nominal invoice ini sendiri (asumsinya invoice ini bakal
        // dilunasi) — bukan lagi "total_harga dikurangi SEMUA Invoice yang
        // pernah dibuat" (bug ditemukan user 2026-10-14, "lo belom motong
        // yang udah dibayar" — booking yang DP-nya lunas lewat alur normal
        // TANPA pernah ada Invoice sebelumnya bakal keliatan sisa penuh lagi
        // padahal DP-nya udah kepotong beneran, sama root cause kayak bug
        // saranInvoice yang udah dibenerin). SATU sumber kebenaran sama
        // saranInvoice (src/app/admin/invoice-kwitansi/page.jsx) & PATCH
        // /api/payments.
        let sisaPembayaran = null;
        if (dokumen.jenis === 'invoice') {
          const sisaSebelumInvoiceIni = await hitungSisaBayar(pool, dokumen.booking_id);
          sisaPembayaran = Math.max(0, sisaSebelumInvoiceIni - Number(dokumen.nominal || 0));
        }

        booking = {
          ...b, jamaah_data: undefined, jamaah_nama: jamaahNama,
          jamaah_breakdown: jamaahBreakdown, jamaah_breakdown_pembayaran: jamaahBreakdownPembayaran,
          opsi_tambahan_data: undefined, opsi_tambahan_nama: opsiTambahanNama,
          dp_dibayar_tanggal: bayarDp?.created_at || null,
          sisa_pembayaran: sisaPembayaran,
        };
      }
    } else if (!isAdmin) {
      // Dokumen manual tanpa booking_id — gak ada konsep "pemilik", cuma
      // admin yang boleh akses.
      return Response.json({ error: 'Akses ditolak.' }, { status: 403 });
    }

    return Response.json({ dokumen, booking, payment });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
