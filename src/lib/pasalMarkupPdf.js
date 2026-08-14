// Versi react-pdf dari src/lib/pasalMarkup.jsx — pakai parser yang SAMA
// (parsePasalMarkup) supaya isi PDF selalu identik dengan yang ditampilkan
// di HTML (/pks, /admin/cetak-pks-mitra, /admin/pasal), cuma output-nya
// elemen react-pdf (<Text>/<View>) bukan JSX HTML.
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { parsePasalMarkup } from '@/lib/pasalMarkup.jsx';

const styles = StyleSheet.create({
  heading: { fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 2 },
  para: { marginVertical: 2, lineHeight: 1.4 },
  listItem: { flexDirection: 'row', marginVertical: 2 },
  listBullet: { width: 16 },
  listText: { flex: 1, lineHeight: 1.4 },
  subList: { marginLeft: 16, marginTop: 2 },
  bold: { fontFamily: 'Helvetica-Bold' },
});

// Ganti **tebal** jadi <Text style={bold}> bersarang — react-pdf mendukung
// <Text> di dalam <Text> untuk styling per-kata/frasa.
function renderInlinePdf(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <Text key={i} style={styles.bold}>{part}</Text> : part
  );
}

function renderListPdf(items, alfa = false) {
  return items.map((item, j) => (
    <View key={j} style={styles.listItem}>
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
