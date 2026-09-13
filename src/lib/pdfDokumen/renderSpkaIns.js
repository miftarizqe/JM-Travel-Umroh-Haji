// Generate PDF Surat Perjanjian Kerja Sama Perwakilan (SPKA-Ins) — konten
// identik dengan src/app/admin/cetak-pks-mitra/[user_id]/page.jsx (HTML),
// tapi dirender lewat react-pdf jadi file PDF asli buat dikirim ke jalur
// materai digital / TTD digital. Dipanggil server-side dari
// /api/admin/dokumen-signature dengan data yang SUDAH di-fetch (bukan
// nge-fetch sendiri) — biar fungsi ini murni presentational & gampang dites.
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop, Field, SPASI_SEBELUM_PASAL_PDF, UKURAN_PDF } from './pdfStyles';
import { renderPasalMarkupPdf } from '@/lib/pasalMarkupPdf';
import { tambahNomorHalaman } from './nomorHalaman';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglIndo = (d) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;

/**
 * @param {object} opts
 * @param {object} opts.user - baris users (name, nik, alamat, wa, created_at, ...)
 * @param {object|null} opts.perekrut
 * @param {string} opts.nomor - nomor surat (ambilAtauBuatNomorSurat)
 * @param {Array<{nomor:number, judul:string, isi:string}>} opts.pasal
 * @param {{nama:string, jabatan:string}} opts.signer
 * @param {object} opts.pengaturan
 * @param {string} opts.logoPath - path absolut file logo
 * @param {boolean} [opts.untukTtdDigital] - kalau true, blok TTD dikosongkan
 *   dgn keterangan "menunggu TTD digital" alih-alih garis kosong buat TTD basah
 * @param {string} [opts.rangkapLabel] - "Rangkap 1 — Untuk JM Travel" dst
 *   (lihat RANGKAP_SPKA_INS di src/lib/materaiRule.js) — SPKA-Ins SATU-SATUNYA
 *   dokumen yang pakai skema 2 rangkap/2 materai, jadi label ini wajib
 *   ditera di tiap salinan biar gak ketuker pas dicetak/diarsip.
 */
export async function renderSpkaInsPdf({ user, perekrut, nomor, pasal, signer, pengaturan, logoPath, untukTtdDigital, rangkapLabel }) {
  const namaPenandatangan = signer?.nama || 'Ahmad Zaky Arief Bestary';
  const jabatanPenandatangan = signer?.jabatan || 'Direktur Pengembangan Bisnis & Sumber Daya Manusia';
  const perekrutEfektif = perekrut || {
    name: namaPenandatangan, nik: '-', alamat: '(mewakili PT. Alkhalid Jaya Megah)', wa: '-',
  };
  const tglGabung = new Date(user.created_at);
  const mergeData = { bank_agen: user.bank, rekening_agen: user.no_rekening, nama_rekening_agen: user.nama_pemilik_rekening };

  const TtdBox = ({ pihak, sub, nama, solo }) => (
    <View style={solo ? [styles.ttdBox, styles.ttdBoxSolo] : styles.ttdBox}>
      <Text>{pihak}</Text>
      <Text style={{ fontFamily: 'Times-Bold' }}>{sub}</Text>
      <View style={styles.ttdSpace}>
        {untukTtdDigital && <Text style={{ fontSize: 6, color: '#999' }}>(menunggu TTD digital)</Text>}
      </View>
      <Text style={styles.ttdLine}>({nama})</Text>
    </View>
  );

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View fixed><Kop pengaturan={pengaturan} logoPath={logoPath} /></View>
        {rangkapLabel && (
          <Text style={{ textAlign: 'right', fontSize: 6.75, fontFamily: 'Times-Bold', color: '#C9952A', marginBottom: 3 }}>{rangkapLabel}</Text>
        )}
        <Text style={styles.judul}>SURAT PERJANJIAN KERJA SAMA PERWAKILAN</Text>
        <Text style={styles.subJudul}>Nomor: {nomor}</Text>

        <Text style={{ fontSize: UKURAN_PDF.normal, marginBottom: 4.5 }}>
          Pada hari {HARI[tglGabung.getDay()]}, tanggal {tglIndo(tglGabung)}, bertempat di Jakarta, kami yang bertanda tangan dibawah ini :
        </Text>

        <Text style={styles.sectionTitle}>Pihak Pertama (Penyelenggara Umroh &amp; Haji)</Text>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <Text style={styles.sectionTitle}>Pihak Kedua (Perwakilan)</Text>
        <Field label="Nama" value={user.name} />
        <Field label="NIK" value={user.nik} />
        <Field label="Alamat" value={user.alamat} />
        <Field label="No. Telepon" value={user.wa} />

        <Text style={styles.sectionTitle}>Pihak Ketiga (Perekrut)</Text>
        <Field label="Nama" value={perekrutEfektif.name} />
        <Field label="NIK" value={perekrutEfektif.nik} />
        <Field label="Alamat" value={perekrutEfektif.alamat} />
        <Field label="No. Telepon" value={perekrutEfektif.wa} />

        <Text style={{ fontSize: UKURAN_PDF.normal, marginTop: 6 }}>
          PIHAK PERTAMA dan PIHAK KEDUA selanjutnya secara bersama-sama disebut <Text style={{ fontFamily: 'Times-Bold' }}>PARA PIHAK</Text>, sepakat untuk mengikatkan diri dalam Perjanjian Kerja Sama dengan ketentuan sebagai berikut:
        </Text>

        {(pasal || []).map(p => (
          <View key={p.nomor} style={{ marginTop: SPASI_SEBELUM_PASAL_PDF }}>
            {/* wrap={false} CUMA di heading (bukan seluruh pasal) — pasal
                panjang (lebih dari 1 halaman) bikin react-pdf crash
                ("unsupported number") kalau seluruh isinya dipaksa jadi 1
                blok gak-bisa-kepotong, dikonfirmasi bug nyata dari
                SPKA-Ins yang isinya 15 pasal, salah satunya panjang. */}
            <View wrap={false}>
              <Text style={{ textAlign: 'center', fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul }}>PASAL {p.nomor}</Text>
              <Text style={{ textAlign: 'center', fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul, marginBottom: 3 }}>{p.judul}</Text>
            </View>
            {renderPasalMarkupPdf(p.isi, mergeData)}
          </View>
        ))}

        <View style={styles.ttdRow}>
          <TtdBox pihak="PIHAK PERTAMA" sub="PT. Alkhalid Jaya Megah" nama={namaPenandatangan} />
          <TtdBox pihak="PIHAK KEDUA" sub="Perwakilan" nama={user.name} />
        </View>
        <View style={styles.ttdSolo}>
          <TtdBox pihak="PIHAK KETIGA" sub="Perekrut" nama={perekrutEfektif.name} solo />
        </View>

      </Page>
    </Document>
  );

  // Nomor halaman DISTEMPEL SETELAH render (pdf-lib), bukan fixed+render
  // react-pdf bawaan — lihat komentar lengkap di nomorHalaman.js kenapa.
  const buffer = await renderToBuffer(doc);
  return tambahNomorHalaman(buffer);
}
