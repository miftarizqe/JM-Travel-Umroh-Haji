// Generate PDF Perjanjian Keberangkatan Jamaah — konten identik dengan
// src/app/admin/cetak-perjanjian/[booking_id]/page.jsx (HTML).
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles } from './pdfStyles';
import { renderPasalMarkupPdf } from '@/lib/pasalMarkupPdf';

const fmtTgl = (t) => {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d)) return t;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * @param {object} opts
 * @param {object} opts.booking - baris bookings (id, prog_name, jamaah_data, pemesan_nama, setuju_pks, setuju_pks_at)
 * @param {Array<{nomor:number, judul:string, isi:string}>} opts.pasal
 * @param {boolean} [opts.untukTtdDigital]
 */
export async function renderJamaahPdf({ booking, pasal, untukTtdDigital }) {
  const jamaahArr = Array.isArray(booking.jamaah_data) ? booking.jamaah_data
    : (typeof booking.jamaah_data === 'string' ? JSON.parse(booking.jamaah_data || '[]') : []);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.judul}>PERJANJIAN KEBERANGKATAN JAMAAH</Text>
        <Text style={styles.subJudul}>Nomor: {booking.id} · Program: {booking.prog_name || '-'}</Text>

        <Text style={styles.sectionTitle}>Jamaah Terkait</Text>
        {jamaahArr.length > 0 ? jamaahArr.map((j, idx) => (
          <Text key={idx} style={{ fontSize: 10 }}>{idx + 1}. {j.nama || '(belum diisi)'}{j.nik ? ` — NIK ${j.nik}` : ''}</Text>
        )) : <Text style={{ fontSize: 10, color: '#999' }}>Data jamaah belum diisi.</Text>}

        <Text style={styles.sectionTitle}>Ketentuan</Text>
        {(pasal || []).map(p => (
          <View key={p.nomor} style={{ marginBottom: 6 }} wrap={false}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10.5 }}>Pasal {p.nomor} — {p.judul}.</Text>
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

        <View style={{ alignItems: 'flex-end', marginTop: 24 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ borderBottomWidth: 1, borderBottomColor: '#000', width: 180, height: 32, marginBottom: 4 }}>
              {untukTtdDigital && <Text style={{ fontSize: 8, color: '#999', textAlign: 'center' }}>(menunggu TTD digital)</Text>}
            </View>
            <Text style={{ fontSize: 10 }}>( {booking.pemesan_nama || '................'} )</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 2 }}>Pemesan / Jamaah JM Travel</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
