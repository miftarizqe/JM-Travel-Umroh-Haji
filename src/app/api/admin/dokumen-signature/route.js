import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { apakahPerluMaterai, RANGKAP_SPKA_INS } from '@/lib/materaiRule';
import { beliMaterai } from '@/lib/eMeterai';
import { kirimUntukTtd, selesaikanTtd } from '@/lib/eSignature';
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

// Proses SATU sesi digital (satu baris dokumen_signature) sampai tuntas:
// upsert draft -> materai (kalau perlu) -> kirim TTD -> (opsional) langsung
// selesaikan di tempat. Dipakai baik oleh dokumen 1-rangkap (jamaah/formulir/
// invoice) maupun 2 kali berturutan oleh SPKA-Ins (rangkap 'travel'/'luar').
//
// `autoSelesai` khusus buat rangkap 'luar' SPKA-Ins: materainya di-TTD PIHAK
// JM TRAVEL SENDIRI (bukan perwakilan) — gak ada pihak eksternal yang perlu
// ditunggu, jadi begitu admin klik "Kirim TTD Digital", tanda tangan JM Travel
// langsung dianggap selesai saat itu juga (persis alur fisik: JM Travel TTD
// dulu sebelum dokumen dikirim ke perwakilan buat ditandatangani).
async function prosesSatuSesiDigital({ dokumen, refId, rangkap, pdfBuffer, signer, perluMaterai, requestedBy, baseUrl, autoSelesai }) {
  const pdfAwalPath = await simpanPdfDokumenSignature(pdfBuffer, { dokumen, refId, tahap: `awal-${rangkap}` });

  await pool.query(
    `INSERT INTO dokumen_signature
      (dokumen, ref_id, rangkap, metode, fase, perlu_materai, signer_nama, signer_email, signer_wa, pdf_awal_path, requested_by, requested_at)
     VALUES (?, ?, ?, 'digital', 'draft', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
      metode = 'digital', fase = 'draft', perlu_materai = VALUES(perlu_materai),
      signer_nama = VALUES(signer_nama), signer_email = VALUES(signer_email), signer_wa = VALUES(signer_wa),
      pdf_awal_path = VALUES(pdf_awal_path), pdf_bermaterai_path = NULL, pdf_final_path = NULL,
      materai_provider = NULL, materai_kode_unik = NULL, materai_dibeli_at = NULL,
      ttd_provider = NULL, ttd_provider_ref = NULL, completed_at = NULL,
      requested_by = VALUES(requested_by), requested_at = CURRENT_TIMESTAMP`,
    [dokumen, refId, rangkap, perluMaterai ? 1 : 0, signer?.nama || null, signer?.email || null, signer?.wa || null, pdfAwalPath, requestedBy]
  );
  const [[sig]] = await pool.query('SELECT * FROM dokumen_signature WHERE dokumen = ? AND ref_id = ? AND rangkap = ?', [dokumen, refId, rangkap]);

  let pdfUntukTtd = pdfBuffer;
  if (perluMaterai) {
    const hasilMaterai = await beliMaterai({ dokumen, refId, pdfBuffer, baseUrl });
    const pdfBermateraiPath = await simpanPdfDokumenSignature(hasilMaterai.pdfBuffer, { dokumen, refId, tahap: `bermaterai-${rangkap}` });
    await pool.query(
      `UPDATE dokumen_signature SET fase = 'materai_selesai', materai_provider = ?, materai_kode_unik = ?, materai_dibeli_at = ?, pdf_bermaterai_path = ? WHERE id = ?`,
      [hasilMaterai.provider, hasilMaterai.kodeUnik, hasilMaterai.dibeliAt, pdfBermateraiPath, sig.id]
    );
    pdfUntukTtd = hasilMaterai.pdfBuffer;
  }

  const hasilTtd = await kirimUntukTtd({ dokumen, refId, signer, pdfBuffer: pdfUntukTtd });
  await pool.query(
    `UPDATE dokumen_signature SET fase = 'ttd_menunggu', ttd_provider = ?, ttd_provider_ref = ? WHERE id = ?`,
    [hasilTtd.provider, hasilTtd.providerRef, sig.id]
  );

  if (autoSelesai) {
    const hasilSelesai = await selesaikanTtd({ providerRef: hasilTtd.providerRef, signer, pdfBuffer: pdfUntukTtd, dokumen });
    const pdfFinalPath = await simpanPdfDokumenSignature(hasilSelesai.pdfBuffer, { dokumen, refId, tahap: `final-${rangkap}` });
    await pool.query(
      `UPDATE dokumen_signature SET fase = 'selesai', pdf_final_path = ?, completed_at = ? WHERE id = ?`,
      [pdfFinalPath, hasilSelesai.selesaiAt, sig.id]
    );
  }

  const [[sigAkhir]] = await pool.query('SELECT * FROM dokumen_signature WHERE id = ?', [sig.id]);
  return sigAkhir;
}

// Kumpulkan data + generate PDF utk 1 jenis dokumen. Untuk spka_ins,
// balikin fungsi generator (bukan buffer langsung) karena PDF-nya digenerate
// 2x (beda rangkapLabel per salinan) — jenis lain cukup 1x generate.
async function siapkanData(dokumen, refId) {
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

    if (dokumen === 'spka_ins') {
      const nomor = await ambilAtauBuatNomorSurat(pool, user.id, 'SPKA-Ins');
      if (nomor) await pastikanSnapshot(pool, user.id, 'spka_ins');
      const { pasal, signer } = await ambilPasalUntukCetak('spka_ins', user.id);
      return {
        user, perekrut, jmSigner: signer,
        generatePdf: (rangkapLabel) => renderSpkaInsPdf({ user, perekrut, nomor, pasal, signer, pengaturan, logoPath, untukTtdDigital: true, rangkapLabel }),
      };
    }
    return {
      user, perekrut,
      generatePdf: () => renderFormulirPdf({ user, perekrut, pengaturan, logoPath, untukTtdDigital: true }),
      signer: { nama: user.name, email: user.email, wa: user.wa },
    };
  }

  if (dokumen === 'jamaah') {
    const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [refId]);
    const booking = rows[0];
    if (!booking) throw Object.assign(new Error('Booking tidak ditemukan'), { status: 404 });
    const [[pemesan]] = await pool.query('SELECT name, email, wa FROM users WHERE id = ?', [booking.ordered_by || booking.user_id]);
    booking.pemesan_nama = pemesan?.name || null;
    const { pasal } = await ambilPasalUntukCetak('jamaah', refId);
    return {
      generatePdf: () => renderJamaahPdf({ booking, pasal, untukTtdDigital: true }),
      signer: { nama: pemesan?.name, email: pemesan?.email, wa: pemesan?.wa },
    };
  }

  // invoice
  const [[dok]] = await pool.query('SELECT * FROM invoice_kwitansi WHERE id = ?', [refId]);
  if (!dok) throw Object.assign(new Error('Dokumen tidak ditemukan'), { status: 404 });
  let booking = null;
  if (dok.booking_id) {
    const [[b]] = await pool.query('SELECT id, prog_name, jumlah_jamaah FROM bookings WHERE id = ?', [dok.booking_id]);
    booking = b || null;
  }
  return {
    generatePdf: () => renderInvoicePdf({ dokumen: dok, booking, pengaturan, logoPath, untukTtdDigital: true }),
    signer: { nama: pengaturan.nama_penandatangan_keuangan || pengaturan.nama_penandatangan, email: null, wa: null },
    materaiCtx: { jenis: dok.jenis, status: dok.status, nominal: dok.nominal },
  };
}

// POST /api/admin/dokumen-signature  body: { dokumen, ref_id, metode }
// Endpoint UNIFIED dipakai keempat jenis dokumen — bukan 4 endpoint bespoke.
// metode='fisik': cuma catat pilihan, jalur upload scan existing sama sekali
// tidak disentuh. metode='digital': generate PDF -> materai (kalau perlu,
// mock) -> kirim TTD (mock) -> notifikasi signer.
//
// SPKA-Ins KHUSUS: 2 rangkap/2 materai (lihat RANGKAP_SPKA_INS) — bukan 1
// sesi kayak dokumen lain. Rangkap 'travel' nunggu TTD PERWAKILAN (async,
// dinotif), rangkap 'luar' langsung auto-selesai (JM Travel TTD di tempat).
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
        `INSERT INTO dokumen_signature (dokumen, ref_id, rangkap, metode, fase, requested_by)
         VALUES (?, ?, 'tunggal', 'fisik', 'selesai', ?)
         ON DUPLICATE KEY UPDATE metode = 'fisik', fase = 'selesai', requested_by = VALUES(requested_by), completed_at = CURRENT_TIMESTAMP`,
        [dokumen, ref_id, isAdmin ? auth.user.id : null]
      );
      return Response.json({ message: 'Dicatat untuk jalur TTD fisik — lanjutkan cetak & unggah scan seperti biasa.' });
    }

    const baseUrl = new URL(request.url).origin;
    const requestedBy = isAdmin ? auth.user.id : null;
    const data = await siapkanData(dokumen, ref_id);

    if (dokumen === 'spka_ins') {
      const hasil = [];
      for (const r of RANGKAP_SPKA_INS) {
        const pdfBuffer = await data.generatePdf(r.label);
        const signerInfo = r.signerPihak === 'perwakilan'
          ? { nama: data.user.name, email: data.user.email, wa: data.user.wa }
          : { nama: data.jmSigner?.nama || 'JM Travel', email: null, wa: null };
        const row = await prosesSatuSesiDigital({
          dokumen: 'spka_ins', refId: ref_id, rangkap: r.rangkap, pdfBuffer, signer: signerInfo,
          perluMaterai: true, requestedBy, baseUrl, autoSelesai: r.signerPihak === 'jm',
        });
        hasil.push(row);
      }

      await catatAudit(pool, {
        actor: auth.user, aksi: 'dokumen_signature_dikirim', target_type: 'spka_ins', target_id: String(ref_id),
        keterangan: '2 rangkap SPKA-Ins dikirim untuk TTD digital (provider mock) — rangkap travel menunggu perwakilan, rangkap luar auto-selesai (TTD JM Travel).',
      });

      const rangkapTravel = hasil.find(h => h.rangkap === 'travel');
      if (rangkapTravel) {
        await kirimNotifikasi(pool, {
          user_id: data.user.id,
          tipe: 'dokumen_menunggu_ttd',
          judul: 'SPKA-Ins Menunggu Tanda Tangan Digital Anda',
          pesan: 'Rangkap Perjanjian Kerja Sama Perwakilan yang akan disimpan JM Travel menunggu tanda tangan digital Anda.',
          link: `/tanda-tangan/${rangkapTravel.id}`,
        });
      }

      return Response.json({ message: 'SPKA-Ins dikirim untuk TTD digital (2 rangkap).', rangkap: hasil });
    }

    // Dokumen 1-rangkap (jamaah/formulir/invoice)
    const pdfBuffer = await data.generatePdf();
    const perluMaterai = apakahPerluMaterai(dokumen, data.materaiCtx || {});
    const row = await prosesSatuSesiDigital({
      dokumen, refId: ref_id, rangkap: 'tunggal', pdfBuffer, signer: data.signer,
      perluMaterai, requestedBy, baseUrl, autoSelesai: false,
    });

    await catatAudit(pool, {
      actor: auth.user, aksi: 'dokumen_signature_dikirim', target_type: dokumen, target_id: String(ref_id),
      keterangan: `Dokumen ${dokumen} dikirim untuk TTD digital (provider mock).`,
    });

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
          link: `/tanda-tangan/${row.id}`,
        });
      }
    }

    return Response.json({ message: 'Dikirim untuk TTD digital.', id: row.id, fase: row.fase });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}

// GET /api/admin/dokumen-signature?dokumen=&ref_id= — status lookup buat
// badge di UI (halaman cetak & /pks). Selalu balikin ARRAY (biasanya 1 baris,
// SPKA-Ins bisa sampai 2 — satu per rangkap) biar UI-nya konsisten.
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
    const [rows] = await pool.query(
      `SELECT * FROM dokumen_signature WHERE dokumen = ? AND ref_id = ? ORDER BY FIELD(rangkap, 'tunggal', 'travel', 'luar')`,
      [dokumen, refId]
    );
    return Response.json({ signatures: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
