// Generate PDF Surat Perjanjian Jamaah Umroh — konten identik dengan
// src/app/admin/cetak-perjanjian/[booking_id]/page.jsx (HTML).
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop, Field, SPASI_SEBELUM_PASAL_PDF, UKURAN_PDF } from './pdfStyles';
import { renderPasalMarkupPdf } from '@/lib/pasalMarkupPdf';
import { tambahNomorHalaman } from './nomorHalaman';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglIndo = (d) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;

const fmtTgl = (t) => {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * @param {object} opts
 * @param {object} opts.booking - baris bookings (id, prog_name, jamaah_data, pemesan_nama, pemesan_wa, created_at, setuju_pks, setuju_pks_at)
 * @param {Array<{nomor:number, judul:string, isi:string}>} opts.pasal
 * @param {{nama:string, jabatan:string}} [opts.signer] - penandatangan Management JM Travel
 * @param {object} [opts.pengaturan]
 * @param {string} [opts.logoPath]
 * @param {boolean} [opts.untukTtdDigital]
 */
export async function renderJamaahPdf({ booking, pasal, signer, pengaturan, logoPath, untukTtdDigital }) {
  const jamaahArr = Array.isArray(booking.jamaah_data) ? booking.jamaah_data
    : (typeof booking.jamaah_data === 'string' ? JSON.parse(booking.jamaah_data || '[]') : []);
  const jamaahTunggal = jamaahArr.length === 1 ? jamaahArr[0] : null;
  const namaPenandatangan = signer?.nama || 'Ahmad Zaky Arief Bestary';
  const jabatanPenandatangan = signer?.jabatan || 'Direktur Pengembangan Bisnis & Sumber Daya Manusia';
  const tglBooking = new Date(booking.created_at);

  const TtdBox = ({ pihak, sub, nama, keterangan }) => (
    <View style={styles.ttdBox}>
      <Text>{pihak}</Text>
      <Text style={{ fontFamily: 'Times-Bold' }}>{sub}</Text>
      <View style={styles.ttdSpace}>
        {untukTtdDigital && <Text style={{ fontSize: 6, color: '#999' }}>(menunggu TTD digital)</Text>}
      </View>
      <Text style={styles.ttdLine}>({nama})</Text>
      {keterangan && <Text style={{ fontSize: 9, marginTop: 2 }}>{keterangan}</Text>}
    </View>
  );

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {pengaturan && <View fixed><Kop pengaturan={pengaturan} logoPath={logoPath} /></View>}
        <Text style={styles.judul}>SURAT PERJANJIAN JAMAAH UMROH</Text>
        <Text style={styles.subJudul}>Nomor: {booking.id}</Text>

        <Text style={{ fontSize: UKURAN_PDF.normal, marginBottom: 4.5 }}>
          Pada hari {HARI[tglBooking.getDay()]}, tanggal {tglIndo(tglBooking)}, bertempat di Jakarta, yang bertanda tangan di bawah ini :
        </Text>

        <Text style={styles.sectionTitle}>Pihak Pertama (Penyelenggara)</Text>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <Text style={styles.sectionTitle}>Pihak Kedua (Jamaah)</Text>
        <Field label="Nama" value={booking.pemesan_nama} />
        <Field label="Program" value={booking.prog_name} />
        <Field label="Alamat" value={jamaahTunggal?.alamat} />
        <Field label="No. Telepon" value={booking.pemesan_wa} />
        <Field label="No. Paspor" value={jamaahTunggal?.paspor} />

        <Text style={{ fontSize: UKURAN_PDF.normal, marginTop: 6 }}>
          PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian Perjalanan Ibadah Umroh dengan ketentuan sebagai berikut:
        </Text>

        {jamaahArr.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>Jamaah Terkait</Text>
            {jamaahArr.map((j, idx) => (
              <Text key={idx} style={{ fontSize: UKURAN_PDF.normal }}>{idx + 1}. {j.nama || '(belum diisi)'}{j.nik ? ` — NIK ${j.nik}` : ''}</Text>
            ))}
          </>
        )}

        {(pasal || []).map(p => (
          <View key={p.nomor} style={{ marginTop: SPASI_SEBELUM_PASAL_PDF }}>
            {/* wrap={false} CUMA di heading — pasal panjang bikin react-pdf
                crash kalau seluruh isinya dipaksa jadi 1 blok gak-bisa-
                kepotong (dikonfirmasi bug nyata di SPKA-Ins). */}
            <View wrap={false}>
              <Text style={{ textAlign: 'center', fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul }}>PASAL {p.nomor}</Text>
              <Text style={{ textAlign: 'center', fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul, marginBottom: 3 }}>{p.judul}</Text>
            </View>
            {renderPasalMarkupPdf(p.isi)}
          </View>
        ))}

        <View style={{ marginTop: 14, padding: 10, backgroundColor: booking.setuju_pks ? '#ecfdf5' : '#fef2f2' }}>
          <Text style={{ fontSize: 9.5, color: booking.setuju_pks ? '#047857' : '#b91c1c' }}>
            {booking.setuju_pks
              ? `Disetujui secara elektronik oleh pemesan pada ${fmtTgl(booking.setuju_pks_at)}.`
              : 'Persetujuan elektronik belum tercatat untuk booking ini.'}
          </Text>
        </View>

        <View style={styles.ttdRow}>
          <TtdBox pihak="PIHAK PERTAMA" sub="PT. Alkhalid Jaya Megah" nama={namaPenandatangan} keterangan={jabatanPenandatangan} />
          <TtdBox pihak="PIHAK KEDUA" sub="Jamaah" nama={booking.pemesan_nama || '................'} />
        </View>

      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return tambahNomorHalaman(buffer);
}
