// GET /api/admin/pasal/contoh-pdf?dokumen=spka_ins — generate PDF "contoh"
// (data dummy) buat tombol "Download PDF Template" di admin
// /admin/pengaturan/dokumen. Dulu tombol ini cuma window.print() dari
// preview HTML di layar — ternyata gak konsisten (jumlah halaman hasil
// print beda dari yang keliatan di preview, ada Pasal nyangkut sendirian —
// dikonfirmasi bug dari PDF user 2026-09-10). Sekarang generate PDF ASLI
// lewat react-pdf (pipeline yang sama persis dipakai buat dokumen
// legal beneran/digital-signing), yang pagination-nya native & deterministik
// — gak ada lagi selisih "preview di layar" vs "hasil cetak".
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kolomSignerUntuk, ambilSignerSkCif } from '@/lib/signerKolom';
import { logoAbsolutePath } from '@/lib/pdfDokumen/simpanPdf';
import { renderSpkaInsPdf } from '@/lib/pdfDokumen/renderSpkaIns';
import { renderJamaahPdf } from '@/lib/pdfDokumen/renderJamaah';
// SK-CIF, Surat Pemblokiran, SPK-AK & SPK-AK Non-Muslim: contoh dibuat dari
// TEMPLATE PDF RESMI (bukan pasal DB) — sama dengan yang dibaca & ditandatangani
// anggota (dikonfirmasi user 2026-10-01, lihat src/lib/dokumenTemplate.js).
import { generateSkCifPdf } from '@/lib/pdfDokumen/skCifOverlay';
import { generateSuratPemblokiranPdf } from '@/lib/pdfDokumen/suratPemblokiranOverlay';
import { generateSpkAkPdf } from '@/lib/pdfDokumen/spkAkOverlay';

const DOKUMEN_VALID = ['spka_ins', 'jamaah', 'spk_ak', 'spk_ak_nonis', 'sk_cif', 'surat_pemblokiran'];

// Data dummy — SAMA persis (nama/nik/alamat) dengan CONTOH_MERGE &
// TTD_PREVIEW di admin/pengaturan/dokumen/page.jsx, JANGAN beda sendiri
// (biar preview di layar & PDF yang diunduh konsisten).
const CONTOH_USER = {
  name: 'Nama Contoh', nik: '3171xxxxxxxxxxxx', alamat: 'Jl. Contoh No. 1, Jakarta', wa: '-',
  created_at: new Date(), bank: 'Bank Contoh', no_rekening: '000-000-0000', nama_pemilik_rekening: 'Nama Contoh',
};
const CONTOH_PEREKRUT = { name: 'Nama Perekrut Contoh', nik: '3171xxxxxxxxxxxx', alamat: 'Jl. Contoh No. 1, Jakarta', wa: '-' };
const CONTOH_MERGE_ISIAN = {
  nama: 'Nama Contoh', nik: '3171xxxxxxxxxxxx', alamat: 'Jl. Contoh No. 1, Jakarta',
  no_rekening: '7080600000', nominal_blokir: '5.000.000', jangka_waktu_hari: '90', tanggal_mulai_blokir: '10 September 2026',
  alamat_kantor: undefined, nama_wakil: undefined, nik_wakil: undefined, jabatan_wakil: undefined,
};

export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const dokumen = searchParams.get('dokumen');
  if (!DOKUMEN_VALID.includes(dokumen)) {
    return Response.json({ error: 'Parameter dokumen tidak valid' }, { status: 400 });
  }

  try {
    const [pasal] = await pool.query(
      'SELECT nomor, tipe, judul, isi FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
      [dokumen]
    );
    const [[pengaturan]] = await pool.query('SELECT * FROM pengaturan WHERE id = 1');
    const logoPath = logoAbsolutePath();

    function signerUntuk(dok) {
      const kolom = kolomSignerUntuk(dok);
      return { nama: pengaturan?.[kolom.nama], jabatan: pengaturan?.[kolom.jabatan] };
    }

    let buffer;
    if (dokumen === 'sk_cif') {
      // Penerima Kuasa = penandatangan SK-CIF yang BENERAN dikonfigurasi admin.
      const skCifSigner = await ambilSignerSkCif(pool);
      buffer = await generateSkCifPdf({
        nama: CONTOH_MERGE_ISIAN.nama, nik: CONTOH_MERGE_ISIAN.nik, alamat: CONTOH_MERGE_ISIAN.alamat,
        noRekening: CONTOH_MERGE_ISIAN.no_rekening, namaWakil: skCifSigner?.nama || 'Nama Penandatangan SK-CIF Contoh',
      });
    } else if (dokumen === 'surat_pemblokiran') {
      buffer = await generateSuratPemblokiranPdf({
        nama: CONTOH_MERGE_ISIAN.nama, nik: CONTOH_MERGE_ISIAN.nik, alamat: CONTOH_MERGE_ISIAN.alamat,
        noRekening: CONTOH_MERGE_ISIAN.no_rekening, nominalBlokir: CONTOH_MERGE_ISIAN.nominal_blokir,
        jangkaWaktuHari: CONTOH_MERGE_ISIAN.jangka_waktu_hari, tanggalMulai: CONTOH_MERGE_ISIAN.tanggal_mulai_blokir,
      });
    } else if (dokumen === 'spk_ak' || dokumen === 'spk_ak_nonis') {
      buffer = await generateSpkAkPdf({
        dokumen, nomor: dokumen === 'spk_ak' ? '09.0001/JMT.JSB.IX/2026 (contoh)' : '09.0001/JMT.JSB-NM.IX/2026 (contoh)',
        nama: CONTOH_USER.name, alamat: CONTOH_USER.alamat, noTelepon: '08xxxxxxxxxx', noPaspor: 'C1234567',
        namaTtd: CONTOH_USER.name, hari: 'Senin', tanggal: '1 Oktober 2026',
      });
    } else if (dokumen === 'spka_ins') {
      buffer = await renderSpkaInsPdf({ user: CONTOH_USER, perekrut: CONTOH_PEREKRUT, nomor: '09.0001/JMT.SPKA-Ins.IX/2026 (contoh)', pasal, signer: signerUntuk('spka_ins'), pengaturan, logoPath });
    } else if (dokumen === 'jamaah') {
      const booking = {
        id: 'BK-CONTOH', prog_name: 'Program Contoh',
        jamaah_data: [{ nama: 'Nama Contoh', nik: '3171xxxxxxxxxxxx' }],
        pemesan_nama: 'Nama Contoh', setuju_pks: false, setuju_pks_at: null,
      };
      buffer = await renderJamaahPdf({ booking, pasal, signer: signerUntuk('jamaah'), pengaturan, logoPath });
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="contoh-${dokumen}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
