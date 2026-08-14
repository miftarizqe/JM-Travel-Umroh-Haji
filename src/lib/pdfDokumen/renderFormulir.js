// Generate PDF Formulir Pendaftaran Perwakilan — konten identik dengan
// src/app/admin/cetak-formulir-mitra/[user_id]/page.jsx (HTML). Pakai
// sumber data yang SAMA dengan SPKA-Ins (GET /api/admin/cetak-pks/[user_id]).
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop, Field } from './pdfStyles';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglIndo = (d) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {object|null} opts.perekrut
 * @param {object} opts.pengaturan
 * @param {string} opts.logoPath
 * @param {boolean} [opts.untukTtdDigital]
 */
export async function renderFormulirPdf({ user, perekrut, pengaturan, logoPath, untukTtdDigital }) {
  const ttlValue = `${user.tempat_lahir || ''}${user.tempat_lahir && user.tanggal_lahir ? ', ' : ''}${user.tanggal_lahir ? tglIndo(new Date(user.tanggal_lahir)) : ''}`;

  const TtdBox = ({ pihak, nama }) => (
    <View style={styles.ttdBox}>
      <Text>{pihak}</Text>
      <View style={styles.ttdSpace}>
        {untukTtdDigital && <Text style={{ fontSize: 8, color: '#999' }}>(menunggu TTD digital)</Text>}
      </View>
      <Text style={styles.ttdLine}>({nama})</Text>
    </View>
  );

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Kop pengaturan={pengaturan} logoPath={logoPath} />
        <Text style={{ fontSize: 10, textAlign: 'right' }}>Nama Perwakilan: {user.name}</Text>
        <Text style={{ fontSize: 10, textAlign: 'right', marginBottom: 10 }}>Kode Perwakilan: {user.kode_unik || '-'}</Text>
        <Text style={styles.judul}>FORMULIR PENDAFTARAN PERWAKILAN</Text>
        <View style={{ height: 12 }} />

        <Text style={styles.sectionTitle}>Data Pribadi</Text>
        <Field label="Nama Lengkap Sesuai KTP" value={user.name} />
        <Field label="Nomor KTP" value={user.nik} />
        <Field label="Tempat, Tanggal Lahir" value={ttlValue} />
        <Field label="Jenis Kelamin" value={user.jenis_kelamin} />
        <Field label="Nama Gadis Ibu Kandung" value={user.nama_ibu} />
        <Field label="Alamat sesuai KTP" value={user.alamat_ktp || user.alamat} />
        <Field label="Alamat Domisili" value={user.alamat_domisili || user.alamat} />
        <Field label="No. Whatsapp" value={user.wa} />
        <Field label="Email Aktif" value={user.email} />
        <Field label="Perekrut" value={perekrut?.name || 'JM Travel'} />
        <Field label="Pekerjaan" value={user.pekerjaan} />

        <Text style={{ fontSize: 9.5, marginTop: 10 }}>
          Dengan ini saya menyatakan bahwa seluruh data yang saya isikan dalam formulir ini adalah benar, lengkap, dan dapat dipertanggungjawabkan. Apabila di kemudian hari terdapat ketidaksesuaian data, saya bersedia menerima konsekuensi sesuai ketentuan yang berlaku.
        </Text>

        <View style={{ marginTop: 10 }}>
          <Field label="Nama Bank" value={user.bank} />
          <Field label="Nomor Rekening" value={user.no_rekening} />
          <Field label="Nama Pemilik Rekening" value={user.nama_pemilik_rekening} />
        </View>

        <View style={styles.ttdRow}>
          <TtdBox pihak="Perwakilan" nama={user.name} />
          <TtdBox pihak="Perekrut / JM Travel" nama={perekrut?.name || 'JM Travel'} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
