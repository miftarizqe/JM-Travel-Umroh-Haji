import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { hitungJamaahBreakdownTtu, pastikanNomorDokumen } from '@/lib/invoiceKwitansi';

const JENIS_LABEL = { invoice: 'Invoice', kwitansi: 'Kwitansi Pembayaran', tanda_terima: 'Tanda Terima Uang' };

// Tanda Terima Uang & Kwitansi pakai alur "Kirim" eksplisit + lock-on-send
// (dikonfirmasi user 2026-10-14) — Invoice BELUM, dibahas terpisah nanti.
const JENIS_LOCK_ON_SEND = ['tanda_terima', 'kwitansi'];

// UU Bea Meterai No.10/2020 Pasal 3 — dokumen yang menyatakan PENERIMAAN
// uang dengan nilai nominal LEBIH DARI Rp5.000.000 wajib materai Rp10.000
// asli (strictly di atas, persis Rp5jt TIDAK kena, dikonfirmasi user
// 2026-10-13). Sama persis logika `butuhMaterai` di halaman cetak
// (/admin/cetak-invoice/[id]/page.jsx) — JANGAN diubah sendiri2, kalau
// salah satu berubah yang lain ikut.
const BATAS_MATERAI = 5_000_000;

// POST /api/admin/invoice-kwitansi/[id]/setuju — "Setuju" tanpa cetak fisik
// (dikonfirmasi user 2026-10-04: TTD digital/e-materai beneran belum ada,
// ini cuma self-certify admin). CUMA boleh dipakai buat dokumen yang gak
// wajib materai (nominal < Rp5jt) — begitu wajib materai, satu-satunya
// jalur sah adalah cetak fisik + materai asli + TTD basah + scan (lihat
// /api/admin/invoice-kwitansi/[id]/scan-fisik), dipaksa di server di sini
// juga (bukan cuma disembunyikan di UI) biar gak bisa dilewatin lewat
// panggilan API langsung (dikonfirmasi user 2026-10-13).
//
// Sebelumnya endpoint ini ditangani Go backend (lihat komentar lama di
// halaman cetak) — dipindah ke Next.js supaya gating materai di atas bisa
// ditegakkan tanpa perlu sentuh repo jm-travel-api. Kalau Caddyfile.tahap2
// di VPS masih proxy path ini ke Go, endpoint ini gak akan kepanggil sampai
// routing-nya disesuaikan juga.
export async function POST(request, { params }) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const [[dokumen]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [id]);
    if (!dokumen) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
    if (dokumen.terkirim) {
      return Response.json({ error: 'Dokumen ini sudah disetujui/dikirim sebelumnya.' }, { status: 400 });
    }

    // Invoice itu TAGIHAN, bukan tanda terima (dikonfirmasi user 2026-10-14)
    // -- gak PERNAH butuh materai, APAPUN nominalnya, walau ditandai "Paid"
    // manual. Materai cuma relevan buat dokumen yang BENERAN jadi bukti
    // PENERIMAAN uang (Kwitansi selalu, Tanda Terima Uang pas statusnya
    // 'paid' -- selalu begitu, lihat generateTandaTerimaUntukPayment).
    const berfungsiTandaTerima = dokumen.jenis === 'kwitansi' || (dokumen.jenis === 'tanda_terima' && dokumen.status === 'paid');
    const butuhMaterai = berfungsiTandaTerima && Number(dokumen.nominal) > BATAS_MATERAI;

    // Tanda Terima Uang & Kwitansi (dikonfirmasi user 2026-10-14): ini
    // SEKARANG tombol "Kirim ke Jamaah" satu-satunya — gak lagi auto-
    // terkirim pas scan diunggah (lihat scan-fisik/route.js). Nominal
    // >Rp5jt WAJIB udah ada scan fisik (materai+TTD) dulu sebelum boleh
    // kirim; kalau belum, ditolak di sini juga (bukan cuma disembunyikan
    // di tombol UI). Nominal <=Rp5jt boleh langsung kirim tanpa materai
    // (self-certify). Invoice (else branch) gak pernah lewat gerbang ini
    // lagi karena butuhMaterai-nya SELALU false buat jenis ini sekarang.
    if (JENIS_LOCK_ON_SEND.includes(dokumen.jenis)) {
      if (butuhMaterai && !dokumen.scan_fisik_path) {
        return Response.json(
          { error: `Nominal Rp${Number(dokumen.nominal).toLocaleString('id-ID')} wajib materai asli — unggah scan fisik (materai+TTD) dulu sebelum kirim ke jamaah.` },
          { status: 400 }
        );
      }
    }

    // Nomor dokumen yang gak wajib materai baru dibakar DI SINI, pas tombol
    // kirim beneran diklik (dikonfirmasi user 2026-10-14) — yang wajib
    // materai harusnya udah dibakar dari GET (lihat pastikanNomorDokumen di
    // route.js), ini cuma jaring pengaman idempotent kalau somehow belum.
    if (JENIS_LOCK_ON_SEND.includes(dokumen.jenis)) {
      dokumen.nomor = await pastikanNomorDokumen(pool, dokumen);
    }

    const terkirimAt = new Date();
    // Snapshot konten dibekukan PERSIS di sini, saat tombol kirim beneran
    // diklik (dikonfirmasi user 2026-10-14) — GET /api/admin/invoice-
    // kwitansi/[id] pakai ini terus sesudahnya, gak ngitung ulang lagi
    // biar dokumen yang udah dikirim gak "berubah" walau booking-nya
    // berubah belakangan (nambah jamaah, dst). hitungJamaahBreakdownTtu
    // otomatis pakai breakdown SELURUH booking buat jenis selain
    // tanda_terima+DP (Kwitansi emang nutup semua jamaah, gak per-payment).
    let jamaahBreakdownSnapshot = null;
    if (JENIS_LOCK_ON_SEND.includes(dokumen.jenis)) {
      jamaahBreakdownSnapshot = JSON.stringify(await hitungJamaahBreakdownTtu(pool, dokumen));
    }
    const metode = JENIS_LOCK_ON_SEND.includes(dokumen.jenis) && butuhMaterai ? 'fisik' : 'setuju';
    await pool.query(
      "UPDATE invoice_kwitansi SET terkirim = 1, terkirim_metode = ?, terkirim_at = ?, jamaah_breakdown_snapshot = COALESCE(?, jamaah_breakdown_snapshot) WHERE id = ?",
      [metode, terkirimAt, jamaahBreakdownSnapshot, id]
    );

    // Notifikasi in-app ke pemilik booking -- sebelumnya "Setuju" CUMA
    // nandain status di database, jamaah gak pernah diberitahu sama sekali
    // (cuma bisa nemu sendiri kalau kebetulan buka Dokumen Saya). Dikirim
    // ke user_id DAN ordered_by kalau beda (booking dipesanin orang lain)
    // (dikonfirmasi user 2026-10-13).
    if (dokumen.booking_id) {
      try {
        const [[booking]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [dokumen.booking_id]);
        const penerima = [booking?.user_id, booking?.ordered_by].filter((v, i, arr) => v && arr.indexOf(v) === i);
        const label = JENIS_LABEL[dokumen.jenis] || dokumen.jenis;
        for (const uid of penerima) {
          await kirimNotifikasi(pool, {
            user_id: uid,
            tipe: 'dokumen_terkirim',
            judul: `${label} Tersedia`,
            pesan: `${label} (${dokumen.nomor}) booking ${dokumen.booking_id} sudah tersedia, bisa dilihat/diunduh.`,
            link: `/admin/cetak-invoice/${id}`,
          });
        }
      } catch (e) {
        console.error('Gagal kirim notifikasi dokumen terkirim:', e);
      }
    }

    return Response.json({ message: 'Dokumen disetujui.', terkirim_at: terkirimAt.toISOString(), terkirim_metode: metode, nomor: dokumen.nomor });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
