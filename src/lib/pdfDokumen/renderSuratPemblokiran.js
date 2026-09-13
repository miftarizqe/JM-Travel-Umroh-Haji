// Generate PDF Surat Pernyataan Kuasa Blokir Rekening & Instruksi
// Pemindahbukuan — dipakai buat "Download PDF Template" di admin
// /admin/pengaturan/dokumen. Sama pola dengan renderSkCif.js: dokumen
// BENERAN yang jamaah tanda-tangani SELALU fisik (HTML di
// /api/sahabat/surat-pemblokiran, gak lewat react-pdf), renderer ini
// KHUSUS versi contoh/template admin biar pagination-nya native & robust
// (dikonfirmasi bug window.print() browser dari PDF user 2026-09-10).
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop, SignatureBlokKuasaPdf } from './pdfStyles';
import { renderPasalMarkupPdf } from '@/lib/pasalMarkupPdf';
import { tambahNomorHalaman } from './nomorHalaman';

/**
 * @param {object} opts
 * @param {string} opts.nomor
 * @param {Array<{nomor:number, tipe:string, judul:string, isi:string}>} opts.pasal
 * @param {object} opts.mergeData - token {{nama}}/{{nik}}/{{nominal_blokir}}/dst
 * @param {object} opts.pengaturan
 * @param {string} opts.logoPath
 */
export async function renderSuratPemblokiranPdf({ nomor, pasal, mergeData, pengaturan, logoPath }) {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View fixed><Kop pengaturan={pengaturan} logoPath={logoPath} /></View>

        <Text style={styles.judul}>SURAT PERNYATAAN</Text>
        <Text style={styles.judul}>KUASA BLOKIR REKENING & INSTRUKSI PEMINDAHBUKUAN</Text>
        <Text style={styles.subJudul}>Nomor: {nomor || '-'}</Text>

        {/* Isian gak punya heading "Pasal N" — dibiarin ngalir bebas antar
            halaman, TANPA wrap={false} (bisa crash react-pdf kalau row-nya
            panjang, dikonfirmasi bug nyata dari SPKA-Ins). */}
        {(pasal || []).map(p => (
          <View key={p.nomor}>
            {renderPasalMarkupPdf(p.isi, mergeData)}
          </View>
        ))}

        {/* Kolom kanan (Mengetahui) SENGAJA kosong — diisi tangan pas
            beneran ke bank, bukan pihak JM Travel, sama persis versi HTML
            (SignatureBlokBank, pasalMarkup.jsx) & file final user. */}
        <SignatureBlokKuasaPdf
          labelKiri="Pemberi Pernyataan," labelKanan="Mengetahui,"
          namaKiri={mergeData?.nama}
          captionKiri="Jamaah Sahabat Baitullah"
          captionKanan={['Petugas', 'Bank Syariah Indonesia']}
        />

      </Page>
    </Document>
  );
  const buffer = await renderToBuffer(doc);
  return tambahNomorHalaman(buffer);
}
