// Style & komponen bersama buat semua renderer PDF dokumen perjanjian
// (src/lib/pdfDokumen/render*.js) — supaya kop surat & layout field
// konsisten antar dokumen, gak diduplikasi 4x.
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { UKURAN_DOKUMEN } from '@/lib/pasalMarkup';

// react-pdf pakai POIN (pt) sebagai satuan asli buat SEMUA angka (fontSize,
// padding, margin, dst) — BUKAN piksel CSS kayak versi HTML (pasalMarkup.jsx
// punya UKURAN_DOKUMEN dalam px). 1px CSS = 0.75pt (96px = 1in = 72pt).
// Sempat kelewat sebelumnya: angka UKURAN_DOKUMEN (12/14/10/13) dipakai
// LANGSUNG sebagai fontSize react-pdf tanpa dikonversi, jadi teks PDF
// keluar ~33% lebih GEDE dari yang keliatan di preview HTML (dikonfirmasi
// bug nyata dari laporan user 2026-09-10: "tulisannya jadi gede2 banget").
// SEMUA px() di bawah ini dipakai buat nge-convert baik fontSize MAUPUN
// spacing (padding/margin/height) yang aslinya diporting dari nilai px
// versi HTML, biar proporsinya kebaca sama kayak preview.
const px = (n) => n * 0.75;
export const UKURAN_PDF = {
  normal: px(UKURAN_DOKUMEN.normal),     // 12px -> 9pt
  judul: px(UKURAN_DOKUMEN.judul),       // 14px -> 10.5pt
  nomor: px(UKURAN_DOKUMEN.nomor),       // 10px -> 7.5pt
  subJudul: px(UKURAN_DOKUMEN.subJudul), // 13px -> 9.75pt
};

export const styles = StyleSheet.create({
  page: { fontFamily: 'Times-Roman', fontSize: UKURAN_PDF.normal, padding: px(40), lineHeight: 1.4 },
  kop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: '#1A4FA0', paddingBottom: px(10), marginTop: 0, marginBottom: px(16) },
  kopLogo: { height: px(46), objectFit: 'contain' },
  // flex:1 WAJIB — tanpa ini kopInfo cuma selebar kontennya sendiri
  // (shrink-to-fit), jadi textAlign:'right' di Text anaknya gak ada efek
  // keliatan (gak ada "sisa lebar" buat digeser ke kanan). Dengan flex:1,
  // kopInfo ngisi SISA lebar baris kop (setelah logo), baru textAlign:
  // 'right' di tiap <Text> beneran nge-rata-kanankan teksnya (dikonfirmasi
  // bug dari screenshot user 2026-09-10 — masih rata kiri walau
  // textAlign udah 'right').
  kopInfo: { flex: 1, fontSize: px(10), textAlign: 'right', lineHeight: 1.5 },
  kopNama: { fontFamily: 'Times-Bold' },
  judul: { textAlign: 'center', fontSize: UKURAN_PDF.judul, fontFamily: 'Times-Bold' },
  subJudul: { textAlign: 'center', fontSize: UKURAN_PDF.nomor, marginBottom: px(14) },
  fieldRow: { flexDirection: 'row', fontSize: UKURAN_PDF.normal, marginBottom: px(3) },
  fieldLabel: { width: px(130) },
  fieldColon: { width: px(10) },
  fieldValue: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#999', borderBottomStyle: 'dotted', minHeight: px(13) },
  sectionTitle: { fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul, marginTop: px(10), marginBottom: px(2) },
  ttdRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: px(30), fontSize: UKURAN_PDF.normal },
  ttdBox: { textAlign: 'center', width: '45%' },
  // Wrapper PIHAK KETIGA (dkk) yang sendirian, bukan berpasangan dalam
  // ttdRow — ttdBox lebar 45% relatif ke PARENT-nya, jadi kalau taruh
  // langsung di parent selebar halaman bakal ketengah beneran cuma kalau
  // parent-nya juga di-center (flex+justifyContent:center), BUKAN cuma
  // margin:auto (yang gak ngefek buat width persentase di react-pdf) —
  // bug nyata dari screenshot user 2026-09-10.
  ttdSolo: { flexDirection: 'row', justifyContent: 'center', marginTop: px(20), fontSize: UKURAN_PDF.normal },
  ttdBoxSolo: { width: px(180) },
  ttdSpace: { height: px(55) },
  ttdLine: { borderTopWidth: 1, borderTopColor: '#000', paddingTop: px(3) },
  // Blok TTD surat pernyataan/kuasa 2-kolom (SK-CIF/Surat Pemblokiran) —
  // versi react-pdf dari SignatureBlok2Pihak (pasalMarkup.jsx). Kolom
  // width TETAP (45%) di semua baris (label/materai/nama) — sama alasan
  // dengan versi HTML: biar label & Nama/Jabatan di bawahnya serata, gak
  // ngambang sendiri-sendiri ngikut panjang teksnya masing-masing.
  kuasaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: px(30), fontSize: UKURAN_PDF.normal },
  kuasaCol: { width: '45%' },
  pageNumber: { position: 'absolute', bottom: px(16), right: px(24), fontSize: UKURAN_PDF.nomor, color: '#999' },
});

// 1x "Enter" kosong sebelum tiap heading "PASAL N" di dokumen PDF —
// SATU nilai, dipakai konsisten oleh renderJamaah/renderSpkaIns/renderSpkAk
// (dikonfirmasi user 2026-09-10, sebelumnya beda-beda: 12 di sini, macem2
// di tempat lain) — sama besaran dgn SPASI_SEBELUM_PASAL versi HTML
// (pasalMarkup.jsx: UKURAN_DOKUMEN.normal*1.6=19.2px), dikonversi ke pt
// biar hasil PDF & cetak layar konsisten proporsinya.
export const SPASI_SEBELUM_PASAL_PDF = px(19.2);

// `textAlign` di View pembungkus (styles.kopInfo) GAK nurun otomatis ke
// <Text> anaknya di react-pdf (beda dari CSS HTML biasa yang inherit) —
// wajib dipasang eksplisit di TIAP <Text>, kalau enggak jatuhnya rata kiri
// (dikonfirmasi bug nyata dari screenshot user 2026-09-10, padahal
// kopInfo.textAlign udah 'right' dari awal).
export function Kop({ pengaturan, logoPath }) {
  return (
    <View style={styles.kop}>
      {logoPath ? <Image src={logoPath} style={styles.kopLogo} /> : <View />}
      <View style={styles.kopInfo}>
        <Text style={[styles.kopNama, { textAlign: 'right' }]}>{pengaturan?.nama_perusahaan || 'JM Travel'}</Text>
        <Text style={{ textAlign: 'right' }}>{pengaturan?.alamat_kantor || ''}</Text>
        <Text style={{ textAlign: 'right' }}>Phone: {pengaturan?.telepon_kantor || ''}</Text>
        <Text style={{ textAlign: 'right' }}>Email: {pengaturan?.email_kantor || ''}</Text>
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

// Blok TTD "( nama )" 2-kolom buat SK-CIF/Surat Pemblokiran — versi
// react-pdf dari SignatureBlok2Pihak (pasalMarkup.jsx), samain persis file
// final user (dikonfirmasi 2026-09-10): SENGAJA gak ada garis di atas
// nama (beda dari ttdLine yang dipakai TtdBox dokumen pasal), `captionKiri`/
// `captionKanan` boleh string 1 baris atau array multi-baris.
export function SignatureBlokKuasaPdf({ labelKiri, labelKanan, namaKiri, namaKanan, captionKiri, captionKanan }) {
  const capKiri = (Array.isArray(captionKiri) ? captionKiri : [captionKiri]).filter(Boolean);
  const capKanan = (Array.isArray(captionKanan) ? captionKanan : [captionKanan]).filter(Boolean);
  return (
    <View style={{ marginTop: px(20) }} wrap={false}>
      <View style={styles.kuasaRow}>
        <View style={styles.kuasaCol}><Text style={{ textAlign: 'center' }}>{labelKiri}</Text></View>
        <View style={styles.kuasaCol}><Text style={{ textAlign: 'center' }}>{labelKanan}</Text></View>
      </View>
      <Text style={{ marginTop: px(30), fontSize: UKURAN_PDF.normal }}>Materai Rp. 10.000</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: px(44), fontSize: UKURAN_PDF.normal }}>
        <View style={styles.kuasaCol}>
          <Text style={{ textAlign: 'center' }}>({namaKiri || '……………………………..'})</Text>
          {capKiri.map((c, i) => <Text key={i} style={{ textAlign: 'center' }}>{c}</Text>)}
        </View>
        <View style={styles.kuasaCol}>
          <Text style={{ textAlign: 'center' }}>({namaKanan || '……………………………..'})</Text>
          {capKanan.map((c, i) => <Text key={i} style={{ textAlign: 'center' }}>{c}</Text>)}
        </View>
      </View>
    </View>
  );
}
