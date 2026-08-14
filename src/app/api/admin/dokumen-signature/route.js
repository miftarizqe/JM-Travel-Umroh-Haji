import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { apakahPerluMaterai } from '@/lib/materaiRule';
import { beliMaterai } from '@/lib/eMeterai';
import { kirimUntukTtd } from '@/lib/eSignature';
import { renderSpkaInsPdf } from '@/lib/pdfDokumen/renderSpkaIns';
import { renderJamaahPdf } from '@/lib/pdfDokumen/renderJamaah';
import { renderFormulirPdf } from '@/lib/pdfDokumen/renderFormulir';
import { renderInvoicePdf } from '@/lib/pdfDokumen/renderInvoice';
import { simpanPdfDokumenSignature, logoAbsolutePath } from '@/lib/pdfDokumen/simpanPdf';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';
import { pastikanSnapshot } from '@/lib/pasalSnapshot';
import { ambilPasalUntukCetak } from '@/lib/pasalUntukCetak';

const DOKUMEN_VALID = ['spka_ins', 'jamaah', 'formulir', 'invoice'];

async function ambilPengaturan() {
  const [[p]] = await pool.query('SELECT * FROM pengaturan WHERE id = 1');
  return p || {};
}

// Generate PDF "awal" (belum materai/ttd) + tentukan siapa signer + konteks
// buat aturan materai (apakahPerluMaterai) — 1 fungsi per jenis dokumen,
// dipanggil dari POST di bawah lewat switch, BUKAN 4 endpoint terpisah.
async function generatePdfAwal(dokumen, refId) {
  const pengaturan = await ambilPengaturan();
  const logoPath = logoAbsolutePath();

  if (dokumen === 'spka_ins' || dokumen === 'formulir') {
    const [rows] = await pool.query(
      `SELECT id, name, nik, wa, email, alamat, alamat_ktp, alamat_domisili, role, kode_unik,
              no_perjanjian_kerjasama, perekrut_id, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu,
              pekerjaan, kode_pos, bank, no_rekening, nama_pemilik_rekening, created_at
       FROM users WHERE id = ?`,
      [refId]
    );
    const user = rows[0];
    if (!user) throw Object.assign(new Error('Akun tidak ditemukan'), { status: 404 });
    if (user.role !== 'perwakilan') throw Object.assign(new Error('Dokumen ini hanya berlaku untuk perwakilan'), { status: 400 });
    user.alamat = user.alamat_ktp || user.alamat;

    let perekrut = null;
    if (user.perekrut_id) {
      const [pr] = await pool.query('SELECT name, nik, wa, alamat, alamat_ktp FROM users WHERE id = ?', [user.perekrut_id]);
      perekrut = pr[0] || null;
      if (perekrut) perekrut.alamat = perekrut.alamat_ktp || perekrut.alamat;
    }

    const signerInfo = { nama: user.name, email: user.email, wa: user.wa };

    if (dokumen === 'spka_ins') {
      const nomor = await ambilAtauBuatNomorSurat(pool, user.id, 'SPKA-Ins');
      if (nomor) await pastikanSnapshot(pool, user.id, 'spka_ins');
      const { pasal, signer } = await ambilPasalUntukCetak('spka_ins', user.id);
      const pdfBuffer = await renderSpkaInsPdf({ user, perekrut, nomor, pasal, signer, pengaturan, logoPath, untukTtdDigital: true });
      return { pdfBuffer, signer: signerInfo, materaiCtx: {} };
    }
    const pdfBuffer = await renderFormulirPdf({ user, perekrut, pengaturan, logoPath, untukTtdDigital: true });
    return { pdfBuffer, signer: signerInfo, materaiCtx: {} };
  }

  if (dokumen === 'jamaah') {
    const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [refId]);
    const booking = rows[0];
    if (!booking) throw Object.assign(new Error('Booking tidak ditemukan'), { status: 404 });
    const [[pemesan]] = await pool.query('SELECT name, email, wa FROM users WHERE id = ?', [booking.ordered_by || booking.user_id]);
    booking.pemesan_nama = pemesan?.name || null;
    const { pasal } = await ambilPasalUntukCetak('jamaah', refId);
    const pdfBuffer = await renderJamaahPdf({ booking, pasal, untukTtdDigital: true });
    return { pdfBuffer, signer: { nama: pemesan?.name, email: pemesan?.email, wa: pemesan?.wa }, materaiCtx: {} };
  }

  // invoice
  const [[dok]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [refId]);
  if (!dok) throw Object.assign(new Error('Dokumen tidak ditemukan'), { status: 404 });
  let booking = null;
  if (dok.booking_id) {
    const [[b]] = await pool.query('SELECT id, prog_name, jumlah_jamaah FROM bookings WHERE id = ?', [dok.booking_id]);
    booking = b || null;
  }
  const pdfBuffer = await renderInvoicePdf({ dokumen: dok, booking, pengaturan, logoPath, untukTtdDigital: true });
  const signerInfo = { nama: pengaturan.nama_penandatangan_keuangan || pengaturan.nama_penandatangan, email: null, wa: null };
  return { pdfBuffer, signer: signerInfo, materaiCtx: { jenis: dok.jenis, status: dok.status, nominal: dok.nominal } };
}

// POST /api/admin/dokumen-signature  body: { dokumen, ref_id, metode }
// Endpoint UNIFIED dipakai keempat jenis dokumen — bukan 4 endpoint bespoke.
// metode='fisik': cuma catat pilihan, jalur upload scan existing sama sekali
// tidak disentuh. metode='digital': generate PDF -> materai (kalau perlu,
// mock) -> kirim TTD (mock) -> notifikasi signer.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { dokumen, ref_id, metode } = await request.json();
    if (!DOKUMEN_VALID.includes(dokumen)) return Response.json({ error: 'Parameter dokumen tidak valid' }, { status: 400 });
    if (!ref_id) return Response.json({ error: 'ref_id wajib diisi' }, { status: 400 });
    const metodeFinal = metode === 'fisik' ? 'fisik' : 'digital';

    const isAdmin = ['admin', 'super_admin'].includes(auth.user.role);
    if (!isAdmin) {
      // Non-admin cuma boleh trigger dokumen jamaah miliknya sendiri
      // (alur self-service dari /pks) — selain itu wajib admin yang memicu.
      if (dokumen !== 'jamaah') return Response.json({ error: 'Hanya admin yang boleh memicu dokumen ini' }, { status: 403 });
      const [[b]] = await pool.query('SELECT user_id, ordered_by FROM bookings WHERE id = ?', [ref_id]);
      if (!b || (b.user_id !== auth.user.id && b.ordered_by !== auth.user.id)) {
        return Response.json({ error: 'Anda tidak berwenang atas booking ini' }, { status: 403 });
      }
    }

    if (metodeFinal === 'fisik') {
      await pool.query(
        `INSERT INTO dokumen_signature (dokumen, ref_id, metode, fase, requested_by)
         VALUES (?, ?, 'fisik', 'selesai', ?)
         ON DUPLICATE KEY UPDATE metode = 'fisik', fase = 'selesai', requested_by = VALUES(requested_by), completed_at = CURRENT_TIMESTAMP`,
        [dokumen, ref_id, isAdmin ? auth.user.id : null]
      );
      return Response.json({ message: 'Dicatat untuk jalur TTD fisik — lanjutkan cetak & unggah scan seperti biasa.' });
    }

    const { pdfBuffer, signer, materaiCtx } = await generatePdfAwal(dokumen, ref_id);
    const perluMaterai = apakahPerluMaterai(dokumen, materaiCtx);
    const pdfAwalPath = await simpanPdfDokumenSignature(pdfBuffer, { dokumen, refId: ref_id, tahap: 'awal' });

    await pool.query(
      `INSERT INTO dokumen_signature
        (dokumen, ref_id, metode, fase, perlu_materai, signer_nama, signer_email, signer_wa, pdf_awal_path, requested_by, requested_at)
       VALUES (?, ?, 'digital', 'draft', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
        metode = 'digital', fase = 'draft', perlu_materai = VALUES(perlu_materai),
        signer_nama = VALUES(signer_nama), signer_email = VALUES(signer_email), signer_wa = VALUES(signer_wa),
        pdf_awal_path = VALUES(pdf_awal_path), pdf_bermaterai_path = NULL, pdf_final_path = NULL,
        materai_provider = NULL, materai_kode_unik = NULL, materai_dibeli_at = NULL,
        ttd_provider = NULL, ttd_provider_ref = NULL, completed_at = NULL,
        requested_by = VALUES(requested_by), requested_at = CURRENT_TIMESTAMP`,
      [dokumen, ref_id, perluMaterai ? 1 : 0, signer?.nama || null, signer?.email || null, signer?.wa || null, pdfAwalPath, isAdmin ? auth.user.id : null]
    );
    const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE dokumen = ? AND ref_id = ?', [dokumen, ref_id]);

    let pdfUntukTtd = pdfBuffer;
    if (perluMaterai) {
      const baseUrl = new URL(request.url).origin;
      const hasilMaterai = await beliMaterai({ dokumen, refId: ref_id, pdfBuffer, baseUrl });
      const pdfBermateraiPath = await simpanPdfDokumenSignature(hasilMaterai.pdfBuffer, { dokumen, refId: ref_id, tahap: 'bermaterai' });
      await pool.query(
        `UPDATE dokumen_signature SET fase = 'materai_selesai', materai_provider = ?, materai_kode_unik = ?, materai_dibeli_at = ?, pdf_bermaterai_path = ? WHERE id = ?`,
        [hasilMaterai.provider, hasilMaterai.kodeUnik, hasilMaterai.dibeliAt, pdfBermateraiPath, sig.id]
      );
      pdfUntukTtd = hasilMaterai.pdfBuffer;
    }

    const hasilTtd = await kirimUntukTtd({ dokumen, refId: ref_id, signer, pdfBuffer: pdfUntukTtd });
    await pool.query(
      `UPDATE dokumen_signature SET fase = 'ttd_menunggu', ttd_provider = ?, ttd_provider_ref = ? WHERE id = ?`,
      [hasilTtd.provider, hasilTtd.providerRef, sig.id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'dokumen_signature_dikirim',
      target_type: dokumen,
      target_id: String(ref_id),
      keterangan: `Dokumen ${dokumen} dikirim untuk TTD digital (provider mock).`,
    });

    // Notifikasi in-app ke signer kalau dia punya akun (jamaah/perwakilan) —
    // invoice signer-nya finance internal, gak perlu dinotif via sistem ini.
    if (dokumen !== 'invoice') {
      const [[signerUser]] = await pool.query(
        dokumen === 'jamaah'
          ? 'SELECT COALESCE(ordered_by, user_id) AS id FROM bookings WHERE id = ?'
          : 'SELECT id FROM users WHERE id = ?',
        [ref_id]
      );
      if (signerUser?.id) {
        await kirimNotifikasi(pool, {
          user_id: signerUser.id,
          tipe: 'dokumen_menunggu_ttd',
          judul: 'Dokumen Menunggu Tanda Tangan Digital',
          pesan: 'Ada dokumen yang menunggu tanda tangan digital Anda.',
          link: `/tanda-tangan/${sig.id}`,
        });
      }
    }

    return Response.json({ message: 'Dikirim untuk TTD digital.', id: sig.id, fase: 'ttd_menunggu' });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}

// GET /api/admin/dokumen-signature?dokumen=&ref_id= — status lookup buat
// badge di UI (halaman cetak & /pks).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const dokumen = searchParams.get('dokumen');
    const refId = searchParams.get('ref_id');
    if (!DOKUMEN_VALID.includes(dokumen) || !refId) {
      return Response.json({ error: 'Parameter tidak valid' }, { status: 400 });
    }
    const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE dokumen = ? AND ref_id = ?', [dokumen, refId]);
    return Response.json({ signature: sig || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
