// Parser + renderer buat markup ringan yang dipakai admin edit isi pasal
// dokumen legal (lihat migration-dokumen-pasal.sql buat spesifikasi
// lengkap sintaksnya). Dipakai di /pks, /admin/cetak-pks-mitra,
// /admin/cetak-perjanjian, dan /admin/pasal (preview).
export const olStyle = { paddingLeft: 20, margin: '4px 0' };
export const alphaStyle = { paddingLeft: 20, margin: '4px 0', listStyleType: 'lower-alpha' };

// Tipografi SERAGAM buat SEMUA dokumen legal (pasal/isian) — Times New
// Roman, ukuran beda per elemen (dikonfirmasi user 2026-09-10). Body/normal
// jadi baseline di container `.sheet` tiap halaman cetak, judul/nomor/
// subJudul (nama pasal) di-override eksplisit di titik masing-masing.
export const FONT_DOKUMEN = "'Times New Roman', Times, serif";
export const UKURAN_DOKUMEN = { normal: 12, judul: 14, nomor: 10, subJudul: 13 };

// Ganti {{token}} dengan nilai dari mergeData sebelum parsing bold/italic,
// biar nilai yang disisipkan (mis. nomor rekening) gak ikut ke-render
// sebagai markup kalau kebetulan mengandung karakter khusus.
function substitusiToken(text, mergeData) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => (mergeData?.[key] ?? m));
}

// Pecah teks jadi array node React — **tebal** jadi <b>, _miring_ jadi <i>
// (dikonfirmasi user 2026-09-10). 1 pass regex gabungan (bukan split bold
// dulu baru italic terpisah) biar urutan kemunculan tetap benar kalau
// campur dalam 1 baris.
function renderInline(text) {
  const regex = /\*\*(.+?)\*\*|_(.+?)_/g;
  const nodes = [];
  let last = 0;
  let key = 0;
  let m;
  while ((m = regex.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<b key={key++}>{m[1]}</b>);
    else nodes.push(<i key={key++}>{m[2]}</i>);
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
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

// Render 1 baris konten dokumen legal LENGKAP dengan heading-nya —
// bedanya gaya heading tergantung `p.tipe` (dikonfirmasi user 2026-09-09):
//   pasal - "Pasal N" + Judul, KETENGAH, ukuran subJudul (13) — perjanjian
//           2/3 pihak: SPKA-Ins/SPK-AK/SPJ. Konvensi dokumen legal formal
//           Indonesia (dikonfirmasi user 2026-09-10, disamakan ke semua
//           dokumen — sebelumnya beda-beda gaya per halaman cetak).
//   isian - TANPA heading sama sekali (judul cuma label internal buat admin
//           nyari di editor, gak pernah dicetak) — dipakai buat SEMUA
//           bagian surat pernyataan (SK-CIF/Surat Pemblokiran): identitas,
//           poin bernomor (tulis pakai sintaks "- item", auto jadi <ol>
//           bernomor 1/2/3), maupun paragraf penutup polos.
// Satu-satunya tempat yang tahu perbedaan ini — dipakai bareng oleh semua
// halaman cetak (cetak-perjanjian, cetak-pks-mitra, cetak-spk-ak,
// status-pendaftaran-sahabat, admin/pengaturan/dokumen), JANGAN duplikat
// logic if/else tipe ini di tempat lain.
// 1x "Enter" kosong sebelum tiap heading "Pasal N" — SATU nilai di sini,
// dipakai konsisten di SEMUA dokumen pasal (dikonfirmasi user 2026-09-10,
// sebelumnya tiap halaman cetak kasih marginTop beda-beda sendiri jadi gak
// konsisten). JANGAN tambah spacing lagi di pemanggil renderPasalBlock.
// Diekspor juga buat mesin pagination A4 (PaginatedPreview) yang nyusun
// heading Pasal sebagai unit terpisah dari renderPasalBlock.
export const SPASI_SEBELUM_PASAL = UKURAN_DOKUMEN.normal * 1.6;

export function renderPasalBlock(p, mergeData) {
  const isi = renderPasalMarkup(p.isi, mergeData);
  if (p.tipe === 'isian') {
    return <div>{isi}</div>;
  }
  return (
    <div style={{ marginTop: SPASI_SEBELUM_PASAL, breakInside: 'avoid' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: UKURAN_DOKUMEN.subJudul }}>Pasal {p.nomor}</div>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: UKURAN_DOKUMEN.subJudul, marginBottom: 6 }}>{p.judul}</div>
      <div>{isi}</div>
    </div>
  );
}

// Kop surat (logo + info perusahaan) SATU-SATUNYA versi HTML dipakai
// SEMUA halaman cetak dokumen legal — sebelumnya diduplikasi lokal di 5
// tempat beda-beda gaya, sekarang 1 sumber. Jarak atas-bawah SENGAJA 0
// (dikonfirmasi user 2026-09-10 — sempat dicoba 1cm, ternyata dobel sama
// spacing yang udah ada dari padding sheet/paddingBottom kop, jadi kejauhan)
// — biar admin yang atur jarak lewat margin sheet pembungkusnya kalau perlu.
export function KopPasalDokumen({ pengaturan }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1A4FA0', paddingBottom: 10, marginTop: 0, marginBottom: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/jm-travel-logo.png" alt="JM Travel" style={{ height: 70, objectFit: 'contain' }} />
      <div style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700 }}>{pengaturan?.nama_perusahaan}</div>
        <div>{pengaturan?.alamat_kantor}</div>
        <div>Phone: {pengaturan?.telepon_kantor}</div>
        <div>Email: {pengaturan?.email_kantor}</div>
      </div>
    </div>
  );
}

// Kotak tanda tangan 1 pihak (Pihak Pertama/Kedua/Ketiga dst) buat dokumen
// pasal 2/3-pihak — dipakai bareng cetak-pks-mitra/cetak-spk-ak/
// cetak-perjanjian dan preview admin, biar layout garis+nama seragam.
// `width` default 45% pas dipakai berpasangan dalam flex row (PIHAK
// PERTAMA/KEDUA) — WAJIB di-override (mis. px tetap) kalau dipakai SENDIRIAN
// di dalam wrapper flex+justifyContent:center (PIHAK KETIGA dkk), soalnya
// 45% dari wrapper yang udah di-center bikin kotaknya nempel kiri, bukan
// beneran ketengah (dikonfirmasi bug dari screenshot user 2026-09-10).
export function TtdBoxHtml({ pihak, sub, nama, keterangan, width = '45%' }) {
  return (
    <div style={{ textAlign: 'center', width, breakInside: 'avoid' }}>
      {pihak && <div>{pihak}</div>}
      {sub && <div style={{ fontWeight: 700 }}>{sub}</div>}
      <div style={{ height: 70 }}></div>
      <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>({nama})</div>
      {keterangan && <div style={{ fontSize: UKURAN_DOKUMEN.nomor, marginTop: 2 }}>{keterangan}</div>}
    </div>
  );
}

// Blok tanda tangan 2-kolom generik (materai di tengah, TANPA heading ala
// dokumen "pasal" PIHAK PERTAMA/KEDUA) — dasar buat SignatureBlokBank
// (Surat Pemblokiran: Pemberi Pernyataan/Mengetahui Petugas Bank) dan
// SignatureBlokKuasa (SK-CIF: Pemberi Kuasa/Penerima Kuasa) — cuma beda
// label & isi kolom kanan, jangan duplikat markup-nya di 2 tempat.
// Kolom kiri/kanan WAJIB width tetap (45%) di SEMUA baris (label, materai,
// nama) — kalau dibiarkan lebar-otomatis-per-baris (justifyContent:
// space-between tanpa width eksplisit), tiap baris ngambang sendiri-sendiri
// ngikut panjang teksnya sendiri, jadi label & Nama/Jabatan di bawahnya gak
// serata (baris pendek nempel kanan, baris panjang lebih ke kiri) — bug
// nyata dari screenshot user 2026-09-10, BUKAN cuma soal rata-tengah.
const KOLOM_SIGNATURE = { width: '45%', textAlign: 'center' };
// Baris tanda tangan "( nama )" — SENGAJA gak pakai garis (border-top)
// kayak TtdBoxHtml, samain persis file final user (Surat Kuasa CIF.docx &
// Surat Pernyataan Pemblokiran Rekening.pdf, dikonfirmasi 2026-09-10):
// tanda tangan asli/nama ditulis tangan LANGSUNG di dalam kurung, gak ada
// garis cetak di atasnya. `caption` = keterangan peran di bawah nama
// (string 1 baris atau array buat multi-baris, mis. ['Direktur Utama',
// 'PT. Alkhalid Jaya Megah']).
function BarisTtdKuasa({ nama, caption }) {
  const baris = (Array.isArray(caption) ? caption : [caption]).filter(Boolean);
  return (
    <div style={KOLOM_SIGNATURE}>
      <div style={{ height: 44 }}></div>
      <div>({nama || '……………………………..'})</div>
      {baris.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  );
}

function SignatureBlok2Pihak({ labelKiri, labelKanan, namaKiri, namaKanan, captionKiri, captionKanan }) {
  return (
    <div style={{ marginTop: 20, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={KOLOM_SIGNATURE}>{labelKiri}</div>
        <div style={KOLOM_SIGNATURE}>{labelKanan}</div>
      </div>
      <div style={{ marginTop: 30 }}>Materai Rp. 10.000</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <BarisTtdKuasa nama={namaKiri} caption={captionKiri} />
        <BarisTtdKuasa nama={namaKanan} caption={captionKanan} />
      </div>
    </div>
  );
}

// Blok tanda tangan Surat Pemblokiran — "Pemberi Pernyataan," / "Mengetahui,"
// kolom kanan SENGAJA kosong (diisi tangan pas beneran ke bank, bukan pihak
// JM Travel) — persis file final user "Surat Pernyataan Pemblokiran
// Rekening.pdf" (dikonfirmasi 2026-09-10, sebelumnya labelnya "Mengetahui
// Petugas Bank" 1 baris — ternyata "Mengetahui," doang di label atas,
// "Petugas"+"Bank Syariah Indonesia" itu caption 2 baris DI BAWAH kolom
// tanda tangan, bukan bagian dari label).
export function SignatureBlokBank({ namaPemberi }) {
  return (
    <SignatureBlok2Pihak labelKiri="Pemberi Pernyataan," labelKanan="Mengetahui,"
      namaKiri={namaPemberi} captionKiri="Jamaah Sahabat Baitullah" captionKanan={['Petugas', 'Bank Syariah Indonesia']} />
  );
}

// Blok tanda tangan SK-CIF (Surat Kuasa Kerjasama Multi CIF) — "Pemberi
// Kuasa" / "Penerima Kuasa," — persis file final user "Surat Kuasa
// CIF.docx" (dikonfirmasi 2026-09-10): kolom kanan captionnya jabatan +
// "PT. Alkhalid Jaya Megah" 2 baris di bawah nama, BUKAN baris "Jabatan:"
// terpisah.
export function SignatureBlokKuasa({ namaPemberi, namaPenerima, jabatanPenerima }) {
  return (
    <SignatureBlok2Pihak labelKiri="Pemberi Kuasa" labelKanan="Penerima Kuasa,"
      namaKiri={namaPemberi} namaKanan={namaPenerima}
      captionKiri="Jamaah Sahabat Baitullah" captionKanan={[jabatanPenerima, 'PT. Alkhalid Jaya Megah']} />
  );
}

// Render SATU block hasil parsePasalMarkup (paragraf/heading-inline/list) —
// dipisah dari renderPasalMarkup (yang map semua block sekaligus) supaya
// bisa dipakai ulang per-block oleh mesin pagination A4 (lihat
// admin/pengaturan/dokumen/page.jsx PaginatedPreview) yang butuh ngukur &
// nyusun tiap block satu-satu ke halaman, bukan array utuh.
export function renderBlockNode(b, key, isFirst) {
  if (b.type === 'heading') {
    return <div key={key} style={{ fontWeight: 700, marginTop: isFirst ? 0 : 10 }}>{renderInline(b.text)}</div>;
  }
  if (b.type === 'p') {
    // 10px (bukan 4px) — kena CSS margin-collapse antar <p> bersebelahan
    // jadi cuma 10px BERSIH (bukan 20px), tapi tetap keliatan jelas sebagai
    // jeda paragraf/baris kosong. 4px kekecilan, jadinya keliatan rapet
    // nempel padahal sumbernya udah dipisah baris kosong (dikonfirmasi
    // bug dari laporan user 2026-09-10 — paling kentara di isian yang
    // isinya deretan field kayak "Nama:"/"No. Identitas:"/"Alamat:").
    return <p key={key} style={{ margin: '10px 0' }}>{renderInline(b.text)}</p>;
  }
  return (
    <ol key={key} style={olStyle}>
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
}

// Render SATU item list (bukan seluruh <ol> block-nya) — khusus buat mesin
// pagination A4 (PaginatedPreview), yang butuh mecah list bernomor jadi
// unit per-item biar bisa ngalir/kepotong antar halaman kayak paragraf
// biasa. Tanpa ini, 1 block list (bisa berisi banyak item panjang)
// diperlakukan atomik — kalau gak cukup ruang buat SELURUH list di sisa
// halaman, semuanya digeser ke halaman berikutnya sekaligus, ninggalin
// ruang kosong gede di halaman sebelumnya (bug nyata dari screenshot user
// 2026-09-10). `startNumber` WAJIB diisi posisi asli item itu (1-based)
// biar penomorannya tetap nyambung biarpun tiap item dirender sebagai
// <ol> terpisah-pisah (native <ol> defaultnya mulai dari 1 tiap elemen).
export function renderListItemNode(item, key, startNumber) {
  return (
    <ol key={key} style={olStyle} start={startNumber}>
      <li>
        {renderInline(item.text)}
        {item.children.length > 0 && (
          <ol style={alphaStyle}>
            {item.children.map((c, k) => <li key={k}>{renderInline(c)}</li>)}
          </ol>
        )}
      </li>
    </ol>
  );
}

export function renderPasalMarkup(markup, mergeData) {
  const blocks = parsePasalMarkup(markup, mergeData);
  return blocks.map((b, i) => renderBlockNode(b, i, i === 0));
}
