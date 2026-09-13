// Versi react-pdf dari src/lib/pasalMarkup.jsx — pakai parser yang SAMA
// (parsePasalMarkup) supaya isi PDF selalu identik dengan yang ditampilkan
// di HTML (/pks, /admin/cetak-pks-mitra, /admin/pasal), cuma output-nya
// elemen react-pdf (<Text>/<View>) bukan JSX HTML.
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { parsePasalMarkup } from '@/lib/pasalMarkup.jsx';

// react-pdf pakai poin (pt) native, bukan piksel CSS — angka di bawah ini
// dikonversi dari "rasa" px versi HTML pakai faktor 0.75 (96px=1in=72pt),
// sama kayak UKURAN_PDF di pdfStyles.js (dikonfirmasi bug "tulisan gede2"
// dari laporan user 2026-09-10 — sebelumnya angka px dipakai mentah-mentah
// jadi pt, jatuhnya lebih gede ~33%).
const styles = StyleSheet.create({
  heading: { fontFamily: 'Times-Bold', marginTop: 6, marginBottom: 1.5 },
  // 3 (bukan 2) — react-pdf/Yoga GAK collapse margin antar sibling kayak
  // CSS HTML, jadi marginVertical di sini nambah PENUH di kedua sisi (3+3=6pt
  // bersih antar paragraf) — samain rasanya sama fix versi HTML (10px≈7.5pt,
  // dikonfirmasi user 2026-09-10 soal isian yang keliatan rapet).
  para: { marginVertical: 3, lineHeight: 1.4 },
  listItem: { flexDirection: 'row', marginVertical: 1.5 },
  listBullet: { width: 12 },
  listText: { flex: 1, lineHeight: 1.4 },
  subList: { marginLeft: 12, marginTop: 1.5 },
  bold: { fontFamily: 'Times-Bold' },
  italic: { fontFamily: 'Times-Italic' },
});

// Ganti **tebal** jadi <Text style={bold}>, _miring_ jadi <Text
// style={italic}> — react-pdf mendukung <Text> di dalam <Text> untuk
// styling per-kata/frasa. Regex gabungan (bukan bold dulu baru italic
// terpisah) biar urutan kemunculan tetap benar kalau campur 1 baris.
function renderInlinePdf(text) {
  const regex = /\*\*(.+?)\*\*|_(.+?)_/g;
  const nodes = [];
  let last = 0;
  let key = 0;
  let m;
  while ((m = regex.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<Text key={key++} style={styles.bold}>{m[1]}</Text>);
    else nodes.push(<Text key={key++} style={styles.italic}>{m[2]}</Text>);
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderListPdf(items, alfa = false) {
  return items.map((item, j) => (
    // wrap={false} per ITEM (bukan seluruh list) — tanpa ini react-pdf bisa
    // motong DI ANTARA nomor bullet & teksnya sendiri (nomor "3." nangkring
    // sendirian di ujung halaman, teksnya baru muncul di halaman berikutnya
    // — dikonfirmasi bug nyata dari PDF SPKA-Ins). Item lain tetap bebas
    // pindah halaman sendiri-sendiri, cuma 1 item ini yang atomik.
    <View key={j} style={styles.listItem} wrap={false}>
      <Text style={styles.listBullet}>{alfa ? `${String.fromCharCode(97 + j)}.` : `${j + 1}.`}</Text>
      <View style={styles.listText}>
        <Text>{renderInlinePdf(item.text)}</Text>
        {item.children?.length > 0 && (
          <View style={styles.subList}>{renderListPdf(item.children.map(c => ({ text: c, children: [] })), true)}</View>
        )}
      </View>
    </View>
  ));
}

export function renderPasalMarkupPdf(markup, mergeData) {
  const blocks = parsePasalMarkup(markup, mergeData);
  return blocks.map((b, i) => {
    if (b.type === 'heading') {
      return <Text key={i} style={styles.heading}>{renderInlinePdf(b.text)}</Text>;
    }
    if (b.type === 'p') {
      return <Text key={i} style={styles.para}>{renderInlinePdf(b.text)}</Text>;
    }
    return <View key={i}>{renderListPdf(b.items)}</View>;
  });
}
