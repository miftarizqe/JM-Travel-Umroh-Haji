// Style & komponen bersama buat semua renderer PDF dokumen perjanjian
// (src/lib/pdfDokumen/render*.js) — supaya kop surat & layout field
// konsisten antar dokumen, gak diduplikasi 4x.
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10.5, padding: 40, lineHeight: 1.4 },
  kop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: '#1A4FA0', paddingBottom: 10, marginBottom: 16 },
  kopLogo: { height: 46, objectFit: 'contain' },
  kopInfo: { fontSize: 9, textAlign: 'right', lineHeight: 1.5 },
  kopNama: { fontFamily: 'Helvetica-Bold' },
  judul: { textAlign: 'center', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  subJudul: { textAlign: 'center', fontSize: 10, marginBottom: 14 },
  fieldRow: { flexDirection: 'row', fontSize: 10, marginBottom: 3 },
  fieldLabel: { width: 130 },
  fieldColon: { width: 10 },
  fieldValue: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#999', borderBottomStyle: 'dotted', minHeight: 13 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, marginTop: 10, marginBottom: 2 },
  ttdRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, fontSize: 10 },
  ttdBox: { textAlign: 'center', width: '45%' },
  ttdSpace: { height: 55 },
  ttdLine: { borderTopWidth: 1, borderTopColor: '#000', paddingTop: 3 },
});

export function Kop({ pengaturan, logoPath }) {
  return (
    <View style={styles.kop}>
      {logoPath ? <Image src={logoPath} style={styles.kopLogo} /> : <View />}
      <View style={styles.kopInfo}>
        <Text style={styles.kopNama}>{pengaturan?.nama_perusahaan || 'JM Travel'}</Text>
        <Text>{pengaturan?.alamat_kantor || ''}</Text>
        <Text>Phone: {pengaturan?.telepon_kantor || ''}</Text>
        <Text>Email: {pengaturan?.email_kantor || ''}</Text>
      </View>
    </View>
  );
}

export function Field({ label, value }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldColon}>:</Text>
      <Text style={styles.fieldValue}>{value || ''}</Text>
    </View>
  );
}
