// Parser + renderer buat markup ringan yang dipakai admin edit isi pasal
// dokumen legal (lihat migration-dokumen-pasal.sql buat spesifikasi
// lengkap sintaksnya). Dipakai di /pks, /admin/cetak-pks-mitra,
// /admin/cetak-perjanjian, dan /admin/pasal (preview).
export const olStyle = { paddingLeft: 20, margin: '4px 0' };
export const alphaStyle = { paddingLeft: 20, margin: '4px 0', listStyleType: 'lower-alpha' };

// Ganti {{token}} dengan nilai dari mergeData sebelum parsing bold, biar
// nilai yang disisipkan (mis. nomor rekening) gak ikut ke-render sebagai
// markup kalau kebetulan mengandung karakter khusus.
function substitusiToken(text, mergeData) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => (mergeData?.[key] ?? m));
}

// Pecah teks jadi array node React, ubah **tebal** jadi <b>.
function renderInline(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

// Parsing murni (tanpa JSX) — dipisah dari rendering supaya bisa dipakai
// ulang oleh renderer lain (mis. src/lib/pasalMarkupPdf.js buat PDF via
// react-pdf), bukan cuma renderPasalMarkup (HTML) di bawah.
export function parsePasalMarkup(markup, mergeData) {
  const lines = substitusiToken(markup || '', mergeData).split('\n');
  const blocks = [];
  let currentList = null; // { items: [{ text, children: [] }] }
  let currentPara = [];

  function flushPara() {
    if (currentPara.length) {
      blocks.push({ type: 'p', text: currentPara.join(' ') });
      currentPara = [];
    }
  }
  function flushList() {
    if (currentList) { blocks.push(currentList); currentList = null; }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); continue; }

    const headingMatch = line.trim().match(/^\*\*(.+)\*\*$/);
    const subItemMatch = line.match(/^ {2}- (.+)$/);
    const itemMatch = !subItemMatch && line.match(/^- (.+)$/);

    if (headingMatch) {
      flushPara(); flushList();
      blocks.push({ type: 'heading', text: headingMatch[1] });
    } else if (itemMatch) {
      flushPara();
      if (!currentList) currentList = { type: 'list', items: [] };
      currentList.items.push({ text: itemMatch[1], children: [] });
    } else if (subItemMatch && currentList?.items.length) {
      flushPara();
      currentList.items[currentList.items.length - 1].children.push(subItemMatch[1]);
    } else {
      flushList();
      currentPara.push(line.trim());
    }
  }
  flushPara(); flushList();
  return blocks;
}

export function renderPasalMarkup(markup, mergeData) {
  const blocks = parsePasalMarkup(markup, mergeData);
  return blocks.map((b, i) => {
    if (b.type === 'heading') {
      return <div key={i} style={{ fontWeight: 700, marginTop: i === 0 ? 0 : 10 }}>{renderInline(b.text)}</div>;
    }
    if (b.type === 'p') {
      return <p key={i} style={{ margin: '4px 0' }}>{renderInline(b.text)}</p>;
    }
    return (
      <ol key={i} style={olStyle}>
        {b.items.map((item, j) => (
          <li key={j}>
            {renderInline(item.text)}
            {item.children.length > 0 && (
              <ol style={alphaStyle}>
                {item.children.map((c, k) => <li key={k}>{renderInline(c)}</li>)}
              </ol>
            )}
          </li>
        ))}
      </ol>
    );
  });
}
