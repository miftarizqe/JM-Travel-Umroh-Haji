// Generate PDF SK-CIF (Surat Kuasa Kerjasama Multi CIF Pada Layanan BSI
// Cash Management) — dipakai buat "Download PDF Template" di admin
// /admin/pengaturan/dokumen. SK-CIF BENERAN yang jamaah tanda-tangani
// SELALU fisik (dicetak dari HTML di /api/sahabat/sk-cif, gak lewat
// react-pdf sama sekali) — renderer ini KHUSUS versi contoh/template admin,
// pakai pipeline react-pdf yang sama kayak SPKA-Ins/SPK-AK/SPJ biar
// pagination-nya native & robust (gak lagi ngandelin window.print() browser
// yang ternyata gak konsisten — dikonfirmasi bug dari PDF user 2026-09-10:
// jumlah halaman preview beda sama hasil print beneran, ada Pasal nyangkut
// sendirian). react-pdf otomatis nyebarin konten ke banyak halaman & ulang
// Kop tiap halaman (prop `fixed`) — gak perlu hitung tinggi piksel manual
// lagi. Nomor halaman DIKECUALIKAN dari "native react-pdf" ini — fitur
// fixed+render bawaannya diam-diam gak ngerender apa-apa kalau pagination-
// nya otomatis dari overflow (bukan manual break), jadi distempel belakangan
// pakai pdf-lib (lihat nomorHalaman.js).
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop, SignatureBlokKuasaPdf } from './pdfStyles';
import { renderPasalMarkupPdf } from '@/lib/pasalMarkupPdf';
import { tambahNomorHalaman } from './nomorHalaman';

/**
 * @param {object} opts
 * @param {string} opts.nomor
 * @param {Array<{nomor:number, tipe:string, judul:string, isi:string}>} opts.pasal
 * @param {object} opts.mergeData - token {{nama}}/{{nik}}/dst +
 *   nama_wakil/nik_wakil/jabatan_wakil (Penerima Kuasa, penandatangan SK-CIF
 *   sendiri — BUKAN Head of Program) buat blok TTD.
 * @param {object} opts.pengaturan
 * @param {string} opts.logoPath
 */
export async function renderSkCifPdf({ nomor, pasal, mergeData, pengaturan, logoPath }) {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View fixed><Kop pengaturan={pengaturan} logoPath={logoPath} /></View>

        <Text style={styles.judul}>SURAT KUASA</Text>
        <Text style={styles.judul}>KERJASAMA MULTI CIF</Text>
        <Text style={styles.judul}>PADA LAYANAN BSI CASH MANAGEMENT</Text>
        <Text style={styles.subJudul}>Nomor: {nomor || '-'}</Text>

        {/* Isian gak punya heading "Pasal N" (gak ada yang perlu dilindungi
            dari yatim) — dibiarin ngalir bebas antar halaman kayak paragraf
            biasa, TANPA wrap={false} (dipasang atomik di seluruh pasal row
            bisa crash react-pdf kalau row-nya panjang, dikonfirmasi bug
            nyata dari SPKA-Ins). */}
        {(pasal || []).map(p => (
          <View key={p.nomor}>
            {renderPasalMarkupPdf(p.isi, mergeData)}
          </View>
        ))}

        <SignatureBlokKuasaPdf
          labelKiri="Pemberi Kuasa" labelKanan="Penerima Kuasa,"
          namaKiri={mergeData?.nama} namaKanan={mergeData?.nama_wakil}
          captionKiri="Jamaah Sahabat Baitullah"
          captionKanan={[mergeData?.jabatan_wakil, 'PT. Alkhalid Jaya Megah']}
        />

      </Page>
    </Document>
  );
  const buffer = await renderToBuffer(doc);
  return tambahNomorHalaman(buffer);
}
