'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import {
  renderPasalBlock, renderBlockNode, renderListItemNode, parsePasalMarkup, SignatureBlokBank, SignatureBlokKuasa,
  KopPasalDokumen, TtdBoxHtml, FONT_DOKUMEN, UKURAN_DOKUMEN, SPASI_SEBELUM_PASAL,
} from '@/lib/pasalMarkup';

const SIGNER_FIELDS = [
  { key: 'nama_penandatangan', label: 'Nama Penandatangan (Pihak Pertama)', placeholder: 'Mis. Ahmad Zaky Arief Bestary' },
  { key: 'jabatan_penandatangan', label: 'Jabatan Penandatangan', placeholder: 'Mis. Direktur Pengembangan Bisnis & SDM' },
];

// Penandatangan Invoice/Kwitansi SENGAJA dipisah dari SIGNER_FIELDS di atas —
// dokumen keuangan biasanya ditandatangani org finance, beda orang dari yang
// tanda tangan SPKA-Ins (biasanya direksi/BD). Kosongin field ini
// kalau mau tetap pakai penandatangan umum (ada fallback otomatis).
const SIGNER_KEUANGAN_FIELDS = [
  { key: 'nama_penandatangan_keuangan', label: 'Nama Penandatangan', placeholder: 'Kosongkan buat pakai Penandatangan Umum di atas' },
  { key: 'jabatan_penandatangan_keuangan', label: 'Jabatan Penandatangan', placeholder: 'Mis. Staff Keuangan' },
];

// SPJ (Perjanjian Jamaah) SEKARANG 2-pihak & SPK-AK 3-pihak (Jamaah + Head
// of Program + Management) — penandatangan Management masing-masing field
// TERPISAH, boleh beda orang dari Penandatangan Umum SPK-PWK di atas
// (dikonfirmasi user 2026-09-09).
const SIGNER_JAMAAH_FIELDS = [
  { key: 'nama_penandatangan_jamaah', label: 'Nama Penandatangan', placeholder: 'Mis. Ahmad Zaky Arief Bestary' },
  { key: 'jabatan_penandatangan_jamaah', label: 'Jabatan Penandatangan', placeholder: 'Mis. Direktur Operasional' },
];
const SIGNER_SPK_AK_FIELDS = [
  { key: 'nama_penandatangan_spk_ak', label: 'Nama Penandatangan', placeholder: 'Mis. Ahmad Zaky Arief Bestary' },
  { key: 'jabatan_penandatangan_spk_ak', label: 'Jabatan Penandatangan', placeholder: 'Mis. Direktur Pengembangan Bisnis & SDM' },
];

// SK-CIF (Penerima Kuasa) — penandatangan SENDIRI, TERPISAH dari Head of
// Program & Penandatangan Umum (dikoreksi 2026-09-10 setelah dicocokkan ke
// file final user "Surat Kuasa CIF.docx" — Penerima Kuasa di situ
// "Muhammad Zaki / Direktur Utama", bukan siapapun yang jadi Head of
// Program). Butuh NIK juga (identitas Penerima Kuasa dicetak di dokumen).
const SIGNER_SK_CIF_FIELDS = [
  { key: 'nama_penandatangan_sk_cif', label: 'Nama Penandatangan', placeholder: 'Mis. Muhammad Zaki' },
  { key: 'nik_penandatangan_sk_cif', label: 'No. Identitas (NIK)', placeholder: 'Mis. 3174010207780003' },
  { key: 'jabatan_penandatangan_sk_cif', label: 'Jabatan Penandatangan', placeholder: 'Mis. Direktur Utama' },
];

const DOKUMEN_LIST = [
  { key: 'spka_ins', label: 'SPK-PWK (Perwakilan)' },
  { key: 'jamaah', label: 'SPJ (Perjanjian Jamaah)' },
  { key: 'spk_ak', label: 'SPK-AK (Jamaah Sahabat Baitullah)' },
  { key: 'sk_cif', label: 'SK-CIF (Sahabat Baitullah)' },
  { key: 'surat_pemblokiran', label: 'Surat Pemblokiran Rekening (Sahabat Baitullah)' },
];

// Judul & nomor contoh yang ditampilkan di atas Preview Dokumen Lengkap —
// SAMA seperti judul yang muncul di halaman cetak beneran (cetak-pks-mitra,
// cetak-perjanjian, dan render inline sk_cif/surat_pemblokiran di
// status-pendaftaran-sahabat), biar preview di sini gak menyesatkan.
// `judul` array = tiap elemen jadi baris judul terpisah (dipakai
// surat_pemblokiran: "SURAT PERNYATAAN" baris 1, sisanya baris 2 — persis
// template resmi BSI, dikonfirmasi user 2026-09-09) — dokumen lain 1 baris.
const DOKUMEN_JUDUL = {
  spka_ins: { judul: ['SURAT PERJANJIAN KERJA SAMA PERWAKILAN'], nomor: '09.0001/JMT.SPKA-Ins.IX/2026' },
  jamaah: { judul: ['SURAT PERJANJIAN JAMAAH UMROH'], nomor: 'BK-CONTOH' },
  spk_ak: { judul: ['SURAT PERJANJIAN JAMAAH UMROH', 'PROGRAM SAHABAT BAITULLAH'], nomor: '09.0001/JMT.JSB.IX/2026' },
  sk_cif: { judul: ['SURAT KUASA', 'KERJASAMA MULTI CIF', 'PADA LAYANAN BSI CASH MANAGEMENT'], nomor: '09.0001/JMT.SK-CIF.IX/2026' },
  surat_pemblokiran: { judul: ['SURAT PERNYATAAN', 'KUASA BLOKIR REKENING & INSTRUKSI PEMINDAHBUKUAN'], nomor: '09.0001/JMT.SURAT-PEMBLOKIRAN.IX/2026' },
};

// Contoh data buat preview — angka/nama cuma dummy, gak pernah disimpan.
// Mencakup token dari SEMUA dokumen (spk_ak/spka_ins pakai bank_agen dkk,
// surat_pemblokiran pakai nama/nik/nominal_blokir dkk) — token yang gak
// relevan buat dokumen yang lagi dilihat cuma gak kepakai, gak masalah.
const CONTOH_MERGE = {
  bank_agen: 'Bank Contoh', rekening_agen: '000-000-0000', nama_rekening_agen: 'Nama Contoh',
  nama: 'Nama Contoh', nik: '3171xxxxxxxxxxxx', alamat: 'Jl. Contoh No. 1, Jakarta',
  no_rekening: '7080600000', nominal_blokir: '5.000.000', jangka_waktu_hari: '90', tanggal_mulai_blokir: '10 September 2026',
  target_minat: 'Umroh 9 Hari — Januari 2027', target_estimasi_harga: '39.500.000',
};

// Sama persis tipeDefaultUntuk() di src/app/api/admin/pasal/route.js — JANGAN
// beda sendiri, dipakai cuma buat preview pasal baru KETIKA belum disimpan
// (server yang nentuin tipe final pas POST).
function tipeDefaultUntuk(dokumen) {
  return (dokumen === 'sk_cif' || dokumen === 'surat_pemblokiran') ? 'isian' : 'pasal';
}

const TIPE_LABEL = { pasal: 'Pasal', isian: 'Isian' };

// Kotak TTD buat preview dokumen 2/3-pihak (dulu gak ada sama sekali di
// preview — dikonfirmasi user 2026-09-10) — pakai nama penandatangan yang
// BENERAN udah diisi di Pengaturan (fallback default kalau belum diisi),
// biar preview persis apa yang bakal kecetak. 2 box pertama sejajar, box
// ke-3 (kalau ada) di bawahnya sendiri — sama pola cetak-pks-mitra/
// cetak-spk-ak.
const TTD_PREVIEW = {
  spka_ins: (p) => [
    { pihak: 'PIHAK PERTAMA', sub: 'PT. Alkhalid Jaya Megah', nama: p.nama_penandatangan || 'Ahmad Zaky Arief Bestary' },
    { pihak: 'PIHAK KEDUA', sub: 'Perwakilan', nama: 'Nama Contoh' },
    { pihak: 'PIHAK KETIGA', sub: 'Perekrut', nama: 'Nama Perekrut Contoh' },
  ],
  jamaah: (p) => [
    { sub: 'PT. Alkhalid Jaya Megah', nama: p.nama_penandatangan_jamaah || 'Ahmad Zaky Arief Bestary' },
    { sub: 'Pemesan / Jamaah', nama: 'Nama Contoh' },
  ],
  spk_ak: (p) => [
    { pihak: 'PIHAK PERTAMA', sub: 'PT. Alkhalid Jaya Megah', nama: p.nama_penandatangan_spk_ak || 'Ahmad Zaky Arief Bestary' },
    { pihak: 'PIHAK KEDUA', sub: 'Jamaah Sahabat Baitullah', nama: 'Nama Contoh' },
    { pihak: 'PIHAK KETIGA', sub: 'Head of Program', nama: 'Nama Head of Program Contoh' },
  ],
};

const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
const lbl = "block text-xs font-semibold text-gray-500 mb-1";

// Form terpisah (bukan didefinisikan di dalam komponen halaman) supaya
// identitasnya stabil antar render — nempel inline di baris pasal yang
// diedit (bukan nge-swap seluruh list jadi form), biar gak perlu scroll.
function FormPasal({ editing, setEditing, saving, showPreview, setShowPreview, onSimpan, onBatal, onHapus }) {
  return (
    <div className="bg-white rounded-xl border-2 border-[#1A4FA0]/30 p-4">
      <div className="font-bold text-[#0E2F6E] mb-3">
        {editing.isNew ? `Tambah ${TIPE_LABEL[editing.tipe] || 'Pasal'} Baru (${TIPE_LABEL[editing.tipe] || 'Pasal'} ${editing.nomor})` : `Edit ${TIPE_LABEL[editing.tipe] || 'Pasal'} ${editing.nomor}`}
      </div>

      <label className={lbl}>Judul {TIPE_LABEL[editing.tipe] || 'Pasal'}</label>
      <input value={editing.judul} onChange={e => setEditing(ed => ({ ...ed, judul: e.target.value }))}
        className={`${inp} mb-3`} />

      <label className={lbl}>Isi Pasal</label>
      <textarea value={editing.isi} onChange={e => setEditing(ed => ({ ...ed, isi: e.target.value }))}
        rows={16} className={`${inp} mb-3 font-mono text-xs leading-relaxed`} />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setShowPreview(p => !p)}
          className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-1.5 rounded-full">
          {showPreview ? 'Sembunyikan Preview' : '👁️ Lihat Preview'}
        </button>
      </div>

      {showPreview && (
        <div className="bg-[#F8F9FD] border border-gray-200 rounded-lg p-4 mb-4 text-[11.5px] leading-relaxed">
          {renderPasalBlock({ nomor: editing.nomor, tipe: editing.tipe, judul: editing.judul, isi: editing.isi }, CONTOH_MERGE)}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onSimpan} disabled={saving}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Menyimpan...' : '💾 Simpan'}
        </button>
        <button onClick={onBatal}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl">
          Batal
        </button>
        {!editing.isNew && (
          <button onClick={onHapus} disabled={saving}
            className="ml-auto text-red-500 hover:text-red-700 text-sm font-bold px-3 py-2.5">
            🗑️ Hapus Pasal Ini
          </button>
        )}
      </div>
    </div>
  );
}

// --- Mesin pagination A4 buat Preview Dokumen Lengkap (dikonfirmasi user
// 2026-09-10) ---
// Preview sebelumnya cuma 1 sheet ketinggian 29.7cm (kalau isinya kepanjangan
// ya numpuk ke bawah aja, gak beneran kepotong per halaman + kop surat gak
// ikut ulang tiap halaman). Sekarang dibikin BENERAN kepotong: konten
// dipecah jadi "unit" sekecil mungkin (per paragraf/list/heading Pasal),
// diukur tinggi renderednya via DOM tersembunyi, baru disusun ke sheet-sheet
// terpisah — tiap sheet dapet Kop suratnya sendiri + nomor halaman pojok
// kanan bawah.
//
// Aturan orphan heading (dikonfirmasi user 2026-09-10): heading "Pasal N" +
// nama pasal TIDAK BOLEH sendirian nangkring di bawah halaman tanpa ada isi
// pasal itu ikut nyusul di halaman yang sama — kalau sisa ruang di halaman
// cuma cukup buat heading doang (gak cukup buat minimal 1 baris isi
// setelahnya), heading itu (dan isinya) digeser ke halaman berikutnya.
// Badan pasal SENDIRI boleh nyambung/kepotong lintas halaman kalau memang
// gak cukup 1 halaman (itu normal, cuma heading yang gak boleh yatim).
const CM_TO_PX = 96 / 2.54;
const A4_HEIGHT_PX = 29.7 * CM_TO_PX;
const SHEET_PADDING = 40;
const SHEET_WIDTH = 720;
const CONTENT_WIDTH = SHEET_WIDTH - SHEET_PADDING * 2;
const FOOTER_HEIGHT = 24;
// Faktor aman per halaman — rasterisasi teks pas BENERAN diprint (headless
// print-to-pdf/dialog print browser) ternyata dikit lebih tinggi daripada
// offsetHeight yang keukur di layar (perbedaan font metric screen vs print
// rendering, walau font & ukuran sama persis), dan selisihnya BERTAMBAH
// makin padat halamannya. Tanpa faktor aman ini, halaman yang "pas banget"
// muat di layar bisa meluber pas diprint — dan karena .sheet cuma minHeight
// (bukan height keras), giliran itu kejadian browser bakal motong sendiri
// di titik overflow-nya, BUKAN di titik yang udah ditentuin algoritma
// orphan-heading (persis bug dari screenshot user 2026-09-10: preview di
// layar rapi, pas diprint jumlah halamannya beda & ada Pasal nyangkut
// sendirian).
//
// SEMPAT dicoba buffer PIKSEL TETAP (mis. 200px) — ternyata gak akurat:
// selisih riilnya proporsional ke JUMLAH KONTEN per halaman, bukan angka
// tetap, jadi buffer tetap entah kelonggaran (boros ruang di halaman
// ringan) atau kekurangan (masih meluber di halaman padat). FAKTOR
// PERKALIAN (dipotong dari budget NOMINAL, bukan dikurangi rata) jauh
// lebih akurat karena otomatis ikut skala sama isi kontennya. 0.85 diuji
// empiris pakai headless Chrome print-to-pdf sampai skenario 25 pasal
// (termasuk teks **bold**) — jumlah halaman hasil hitungan JS PERSIS sama
// dengan jumlah halaman fisik hasil print, gak ada heading yang nyangkut
// sendirian. JANGAN naikkan ke atas 0.85 tanpa dites ulang pola yang sama
// (lihat riwayat obrolan 2026-09-10 soal ini kalau butuh re-verifikasi).
const SAFETY_FACTOR = 0.85;

// List bernomor (block type 'list' dari parsePasalMarkup) DIPECAH per-item
// jadi unit sendiri-sendiri (bukan 1 unit gede buat seluruh list) — kalau
// dibiarin atomik, list panjang (banyak item) yang gak cukup muat di sisa
// halaman bakal digeser SELURUHNYA ke halaman berikutnya, ninggalin ruang
// kosong gede di halaman sebelumnya (bug nyata dari screenshot user
// 2026-09-10, kejadian di SK-CIF & SPKA-Ins). `startNumber` per item dijaga
// biar penomoran tetap nyambung 1,2,3,... walau item-itemnya kepencar ke
// <ol> terpisah-pisah pas dirender (lihat renderListItemNode).
function buildUnitsPagination(pasal, mergeData) {
  const units = [];
  pasal.forEach(p => {
    if (p.tipe === 'pasal') {
      units.push({ key: `h-${p.nomor}`, kind: 'heading', pasalNomor: p.nomor, nomorPasal: p.nomor, judulPasal: p.judul });
    }
    const blocks = parsePasalMarkup(p.isi, mergeData);
    blocks.forEach((b, i) => {
      if (b.type === 'list') {
        b.items.forEach((item, j) => {
          units.push({ key: `b-${p.nomor}-${i}-${j}`, kind: 'listitem', pasalNomor: p.nomor, item, startNumber: j + 1, isFirstOfPasal: i === 0 && j === 0 });
        });
      } else {
        units.push({ key: `b-${p.nomor}-${i}`, kind: 'body', pasalNomor: p.nomor, block: b, isFirstOfPasal: i === 0 });
      }
    });
  });
  return units;
}

function renderUnitPagination(u, isFirstOnPage) {
  if (u.kind === 'heading') {
    return (
      <div key={u.key} style={{ marginTop: isFirstOnPage ? 0 : SPASI_SEBELUM_PASAL }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: UKURAN_DOKUMEN.subJudul }}>Pasal {u.nomorPasal}</div>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: UKURAN_DOKUMEN.subJudul, marginBottom: 6 }}>{u.judulPasal}</div>
      </div>
    );
  }
  if (u.kind === 'ttd') return u.node;
  if (u.kind === 'listitem') return renderListItemNode(u.item, u.key, u.startNumber);
  return renderBlockNode(u.block, u.key, u.isFirstOfPasal);
}

function footerTtdNode(dokumen, pengaturan, mergeData) {
  if (dokumen === 'surat_pemblokiran') {
    return <SignatureBlokBank namaPemberi={mergeData.nama} />;
  }
  if (dokumen === 'sk_cif') {
    return <SignatureBlokKuasa namaPemberi={mergeData.nama} namaPenerima={mergeData.nama_wakil} jabatanPenerima={mergeData.jabatan_wakil} />;
  }
  if (TTD_PREVIEW[dokumen]) {
    const boxes = TTD_PREVIEW[dokumen](pengaturan);
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
          {boxes.slice(0, 2).map((b, i) => <TtdBoxHtml key={i} {...b} />)}
        </div>
        {boxes[2] && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
            <TtdBoxHtml {...boxes[2]} width={300} />
          </div>
        )}
      </>
    );
  }
  return null;
}

// Susun unit ke halaman-halaman — greedy fill, kecuali aturan orphan
// heading di atas.
function susunHalaman(units, ukuranUnit, ukuranKop, ukuranJudul) {
  const pages = [];
  let current = [];
  let used = 0;
  let pageIdx = 0;
  const availUntuk = (idx) => (A4_HEIGHT_PX - SHEET_PADDING * 2 - ukuranKop - (idx === 0 ? ukuranJudul : 0) - FOOTER_HEIGHT) * SAFETY_FACTOR;

  let i = 0;
  while (i < units.length) {
    const u = units[i];
    const h = ukuranUnit[i] || 0;
    const avail = availUntuk(pageIdx) - used;

    let needed = h;
    if (u.kind === 'heading') {
      const next = units[i + 1];
      const nextIkut = next && next.pasalNomor === u.pasalNomor && (next.kind === 'body' || next.kind === 'listitem');
      if (nextIkut) needed = h + (ukuranUnit[i + 1] || 0);
    }

    if (needed <= avail || current.length === 0) {
      current.push(i); used += h; i++;
    } else {
      pages.push(current); current = []; used = 0; pageIdx++;
    }
  }
  if (current.length) pages.push(current);
  return pages;
}

// Preview dokumen LENGKAP (bukan cuma 1 pasal kayak FormPasal di atas) —
// kop surat + judul + nomor contoh + SEMUA pasal, dipecah BENERAN per
// halaman A4 (lihat blok komentar mesin pagination di atas). Ukuran &
// style SHEET-nya PERSIS halaman cetak beneran (width 720, @page A4,
// isolasi print) — dikonfirmasi user 2026-09-10: preview ini harus WYSIWYG.
// Tombol Print/Save PDF di sini jadi cara admin "download template"
// dokumen ini (data contoh, bukan data jamaah asli).
function PreviewDokumenLengkap({ dokumen, pasal, pengaturan }) {
  const info = DOKUMEN_JUDUL[dokumen] || { judul: dokumen, nomor: '-' };
  // nama_wakil/nik_wakil/jabatan_wakil (Penerima Kuasa SK-CIF) ambil dari
  // Penandatangan SK-CIF yang BENERAN dikonfigurasi admin kalau udah diisi
  // — biar preview isi pasal (token {{nama_wakil}} dkk di body) & blok TTD
  // di bawahnya nunjukkin nama yang SAMA, gak mismatch.
  const mergeData = useMemo(() => ({
    ...CONTOH_MERGE,
    alamat_kantor: pengaturan?.alamat_kantor,
    nama_wakil: pengaturan?.nama_penandatangan_sk_cif || 'Nama Penandatangan SK-CIF Contoh',
    nik_wakil: pengaturan?.nik_penandatangan_sk_cif || '3171xxxxxxxxxxxx',
    jabatan_wakil: pengaturan?.jabatan_penandatangan_sk_cif || 'Direktur Utama',
  }), [pengaturan]);

  const units = useMemo(() => {
    const base = buildUnitsPagination(pasal, mergeData);
    if (pasal.length > 0) base.push({ key: 'ttd', kind: 'ttd', pasalNomor: null, node: footerTtdNode(dokumen, pengaturan, mergeData) });
    return base;
  }, [pasal, mergeData, dokumen, pengaturan]);

  const [ukuran, setUkuran] = useState(null);
  const measureRef = useRef(null);
  const kopRef = useRef(null);
  const judulRef = useRef(null);

  useLayoutEffect(() => {
    if (!measureRef.current || units.length === 0) { setUkuran(null); return; }
    const els = measureRef.current.querySelectorAll('[data-unit]');
    setUkuran({
      kop: kopRef.current?.offsetHeight || 0,
      judul: judulRef.current?.offsetHeight || 0,
      unit: Array.from(els).map(el => el.offsetHeight),
    });
  }, [units]);

  const pages = useMemo(() => {
    if (units.length === 0) return [];
    if (!ukuran) return null;
    return susunHalaman(units, ukuran.unit, ukuran.kop, ukuran.judul);
  }, [units, ukuran]);

  const sheetStyle = { background: '#fff', width: SHEET_WIDTH, minHeight: '29.7cm', margin: '0 auto', padding: SHEET_PADDING, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal, lineHeight: 1.6, color: '#111', position: 'relative' };

  return (
    <div className="mb-4">
      <div className="no-print text-center mb-2">
        {/* PDF asli lewat react-pdf (server-side, pipeline sama kayak dokumen
            legal beneran) — BUKAN window.print() lagi. Pagination-nya native
            & deterministik, gak ada lagi selisih "preview di layar" vs
            "hasil cetak" (dikonfirmasi bug dari PDF user 2026-09-10). */}
        <a href={`/api/admin/pasal/contoh-pdf?dokumen=${dokumen}`} target="_blank" rel="noopener noreferrer"
          className="inline-block text-xs font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-4 py-2 rounded-full">
          📄 Download PDF Template
        </a>
      </div>

      {/* Kontainer pengukuran tersembunyi — render semua unit 1x pakai lebar
          konten asli buat diukur tingginya lewat offsetHeight, gak pernah
          keliatan user (position fixed di luar viewport). */}
      <div ref={measureRef} style={{ position: 'fixed', left: -99999, top: 0, width: CONTENT_WIDTH, visibility: 'hidden', fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal, lineHeight: 1.6 }} aria-hidden="true">
        <div ref={kopRef}><KopPasalDokumen pengaturan={pengaturan} /></div>
        <div ref={judulRef}>
          {info.judul.map((baris, i) => (
            <div key={i} style={{ textAlign: 'center', fontWeight: 800, fontSize: UKURAN_DOKUMEN.judul }}>{baris}</div>
          ))}
          <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.nomor, color: '#999', marginBottom: 16 }}>Nomor: {info.nomor} (contoh)</div>
        </div>
        {units.map(u => <div key={u.key} data-unit>{renderUnitPagination(u, false)}</div>)}
      </div>

      <div className="print-area">
        {units.length === 0 ? (
          <div className="sheet" style={sheetStyle}>
            <KopPasalDokumen pengaturan={pengaturan} />
            {info.judul.map((baris, i) => (
              <div key={i} style={{ textAlign: 'center', fontWeight: 800, fontSize: UKURAN_DOKUMEN.judul }}>{baris}</div>
            ))}
            <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.nomor, color: '#999', marginBottom: 16 }}>Nomor: {info.nomor} (contoh)</div>
            <div style={{ textAlign: 'center', color: '#999', padding: '24px 0' }}>Belum ada pasal buat dokumen ini.</div>
          </div>
        ) : !pages ? (
          <div className="sheet" style={{ ...sheetStyle, textAlign: 'center', color: '#999', paddingTop: 200 }}>Menyiapkan preview...</div>
        ) : pages.map((idxList, pageIdx) => (
          <div key={pageIdx} className="sheet" style={{ ...sheetStyle, marginTop: pageIdx === 0 ? 0 : 24 }}>
            <KopPasalDokumen pengaturan={pengaturan} />
            {pageIdx === 0 && (
              <>
                {info.judul.map((baris, i) => (
                  <div key={i} style={{ textAlign: 'center', fontWeight: 800, fontSize: UKURAN_DOKUMEN.judul }}>{baris}</div>
                ))}
                <div style={{ textAlign: 'center', fontSize: UKURAN_DOKUMEN.nomor, color: '#999', marginBottom: 16 }}>Nomor: {info.nomor} (contoh)</div>
              </>
            )}
            {idxList.map((unitIdx, j) => renderUnitPagination(units[unitIdx], j === 0))}
            <div style={{ position: 'absolute', bottom: 16, right: 24, fontSize: UKURAN_DOKUMEN.nomor, color: '#999' }}>
              Halaman {pageIdx + 1} / {pages.length}
            </div>
          </div>
        ))}
      </div>
      <div className="no-print text-center text-xs text-gray-400 mt-2">
        ℹ️ Preview pakai data contoh (bukan data jamaah asli) — proporsi &amp; isi PERSIS hasil cetak/PDF beneran, sudah kepotong per halaman A4.
      </div>
    </div>
  );
}

export default function AdminPengaturanDokumenPage() {
  const router = useRouter();
  const [user] = useCurrentUser();

  // --- Penandatangan ---
  const [signerForm, setSignerForm] = useState(null);
  const [signerSaving, setSignerSaving] = useState(false);
  const [signerSaved, setSignerSaved] = useState(false);
  const [uploadingTtd, setUploadingTtd] = useState(false);
  const [uploadingCap, setUploadingCap] = useState(false);

  // --- Isi Pasal ---
  const [dokumen, setDokumen] = useState('spka_ins');
  const [pasal, setPasal] = useState([]);
  const [loadingPasal, setLoadingPasal] = useState(true);
  const [editing, setEditing] = useState(null); // { nomor, judul, isi, isNew }
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPreviewDokumen, setShowPreviewDokumen] = useState(false);
  const [reordering, setReordering] = useState(null); // nomor pasal yg lagi digeser

  function muatPasal(dok) {
    fetch(`/api/admin/pasal?dokumen=${dok}`)
      .then(r => r.json())
      .then(d => { setPasal(d.pasal || []); setLoadingPasal(false); })
      .catch(() => setLoadingPasal(false));
  }

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/pengaturan')
      .then(r => r.json())
      .then(d => setSignerForm(d.pengaturan || {}))
      .catch(() => setSignerForm({}));
    muatPasal(dokumen);
  }, [user, dokumen]);

  if (!user || !['admin','super_admin'].includes(user.role) || !signerForm) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  function ubahSigner(key, val) {
    setSignerForm(f => ({ ...f, [key]: val }));
    setSignerSaved(false);
  }

  async function simpanSigner() {
    setSignerSaving(true);
    try {
      const body = {};
      [...SIGNER_FIELDS, ...SIGNER_KEUANGAN_FIELDS, ...SIGNER_JAMAAH_FIELDS, ...SIGNER_SPK_AK_FIELDS, ...SIGNER_SK_CIF_FIELDS].forEach(f => { body[f.key] = signerForm[f.key]; });
      const res = await fetch('/api/admin/pengaturan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
      setSignerSaved(true);
    } catch { alert('Terjadi kesalahan'); }
    setSignerSaving(false);
  }

  async function uploadGambarSigner(kolom, file, setUploading) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kolom', kolom);
      const res = await fetch('/api/admin/pengaturan/upload-gambar', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengunggah gambar'); return; }
      setSignerForm(f => ({ ...f, [kolom]: d.path }));
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }

  function mulaiEdit(p) {
    setEditing({ nomor: p.nomor, tipe: p.tipe, judul: p.judul, isi: p.isi, isNew: false });
    setShowPreview(false);
  }

  function mulaiTambah() {
    setEditing({ nomor: pasal.length ? pasal[pasal.length - 1].nomor + 1 : 1, tipe: tipeDefaultUntuk(dokumen), judul: '', isi: '', isNew: true });
    setShowPreview(false);
  }

  async function simpanPasal() {
    if (!editing.judul.trim() || !editing.isi.trim()) { alert('Judul & isi tidak boleh kosong!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pasal', {
        method: editing.isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen, nomor: editing.nomor, judul: editing.judul, isi: editing.isi }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan pasal'); return; }
      setEditing(null);
      muatPasal(dokumen);
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function hapusPasal() {
    if (!confirm(`Hapus Pasal ${editing.nomor} — ${editing.judul}? Pasal sesudahnya otomatis geser nomor.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pasal?dokumen=${dokumen}&nomor=${editing.nomor}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menghapus pasal'); return; }
      setEditing(null);
      muatPasal(dokumen);
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function geserPasal(nomor, arah) {
    setReordering(nomor);
    try {
      const res = await fetch('/api/admin/pasal', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen, nomor, arah }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menggeser pasal'); return; }
      muatPasal(dokumen);
    } catch { alert('Terjadi kesalahan'); }
    setReordering(null);
  }

  return (
    <Layout title="📜 Pengaturan Dokumen" backHref="/admin?tab=dashboard">
      {/* Dibungkus .no-print (bukan lagi andalin "sembunyiin semua + absolute-in
          .print-area" kayak sebelumnya) — position:absolute di .print-area
          ternyata bikin Chrome gagal ngitung break-after:page dengan bener
          pas print (2 .sheet logis suka ketumpuk di 1 halaman fisik, bug
          nyata dari PDF yang dikirim user 2026-09-10). display:none via
          .no-print itungannya bersih buat mesin fragmentasi print, gak ada
          efek samping kayak absolute positioning. */}
      <div className="no-print">
      <div className="text-xs text-gray-400 mb-4">
        Kumpulan pengaturan buat dokumen legal (SPK-PWK/SPJ/SPK-AK/SK-CIF) — penandatangan & isi pasal, gak perlu ubah kode lagi.
      </div>

      {/* PENANDATANGAN */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-1">✍️ Penandatangan</div>
        <div className="text-xs text-gray-400 mb-3">
          Dipakai di dokumen SPK-PWK.
          Begitu dokumen seseorang dibekukan (nomor surat sudah digenerate), dokumennya TETAP pakai nama/jabatan versi saat itu walau field ini diedit lagi nanti.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>
        <hr className="border-gray-100 my-4" />

        <div className="font-bold text-[#0E2F6E] mb-1">🧾 Penandatangan Invoice/Kwitansi (Keuangan)</div>
        <div className="text-xs text-gray-400 mb-3">
          Biasanya beda orang dari penandatangan SPKA di atas (org finance, bukan direksi/BD). Kosongkan buat pakai Penandatangan Umum.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_KEUANGAN_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>

        <hr className="border-gray-100 my-4" />

        <div className="font-bold text-[#0E2F6E] mb-1">📄 Penandatangan SPJ (Perjanjian Jamaah)</div>
        <div className="text-xs text-gray-400 mb-3">
          Pihak Management JM Travel di Surat Perjanjian Jamaah Umroh — boleh beda orang dari Penandatangan Umum di atas.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_JAMAAH_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>

        <hr className="border-gray-100 my-4" />

        <div className="font-bold text-[#0E2F6E] mb-1">🤝 Penandatangan SPK-AK (Sahabat Baitullah)</div>
        <div className="text-xs text-gray-400 mb-3">
          Pihak Management JM Travel (Pihak Pertama) di SPK-AK — Pihak Ketiga (Head of Program) diatur terpisah lewat halaman Pengaturan Komisi Sahabat.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_SPK_AK_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>

        <hr className="border-gray-100 my-4" />

        <div className="font-bold text-[#0E2F6E] mb-1">🔑 Penandatangan SK-CIF (Penerima Kuasa)</div>
        <div className="text-xs text-gray-400 mb-3">
          Wakil PT. Alkhalid Jaya Megah yang menerima kuasa dari jamaah di SK-CIF — penandatangan SENDIRI, TERPISAH dari Head of Program & Penandatangan Umum di atas.
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {SIGNER_SK_CIF_FIELDS.map(f => (
            <div key={f.key}>
              <label className={lbl}>{f.label}</label>
              <input value={signerForm[f.key] || ''} onChange={e => ubahSigner(f.key, e.target.value)}
                placeholder={f.placeholder} className={inp} />
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-3">
          <div>
            <label className={lbl}>Tanda Tangan Digital (gambar, background transparan lebih bagus)</label>
            {signerForm.ttd_penandatangan_keuangan_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signerForm.ttd_penandatangan_keuangan_path} alt="TTD" className="h-16 mb-2 border border-gray-100 rounded-lg bg-gray-50 px-2" />
            )}
            <input type="file" accept="image/jpeg,image/png" disabled={uploadingTtd}
              onChange={e => { uploadGambarSigner('ttd_penandatangan_keuangan_path', e.target.files?.[0], setUploadingTtd); e.target.value = ''; }}
              className="text-xs" />
            {uploadingTtd && <div className="text-xs text-gray-400 mt-1">Mengunggah...</div>}
          </div>
          <div>
            <label className={lbl}>Cap Perusahaan (gambar, background transparan lebih bagus)</label>
            {signerForm.cap_perusahaan_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signerForm.cap_perusahaan_path} alt="Cap Perusahaan" className="h-16 mb-2 border border-gray-100 rounded-lg bg-gray-50 px-2" />
            )}
            <input type="file" accept="image/jpeg,image/png" disabled={uploadingCap}
              onChange={e => { uploadGambarSigner('cap_perusahaan_path', e.target.files?.[0], setUploadingCap); e.target.value = ''; }}
              className="text-xs" />
            {uploadingCap && <div className="text-xs text-gray-400 mt-1">Mengunggah...</div>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={simpanSigner} disabled={signerSaving}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            {signerSaving ? 'Menyimpan...' : '💾 Simpan Penandatangan'}
          </button>
          {signerSaved && <span className="text-sm text-green-600 font-semibold">✅ Tersimpan!</span>}
        </div>
      </div>

      {/* ISI PASAL */}
      <div className="font-bold text-[#0E2F6E] mb-1">📜 Isi Pasal</div>
      <div className="text-xs text-gray-400 mb-4">
        Perubahan cuma berlaku ke dokumen yang BELUM dibekukan (perwakilan yang nomor suratnya belum pernah digenerate, atau booking jamaah yang belum klik Setuju). Dokumen yang sudah dibekukan TETAP pakai isi versi lama — lihat tanda 🔒 di halaman cetaknya.
        Sintaks: <code className="bg-gray-100 px-1 rounded">**tebal**</code>, <code className="bg-gray-100 px-1 rounded">_miring_</code>, <code className="bg-gray-100 px-1 rounded">- item list</code>, <code className="bg-gray-100 px-1 rounded">  - sub-item huruf</code> (indent 2 spasi),
        dan <code className="bg-gray-100 px-1 rounded">{'{{bank_agen}}'}</code> / <code className="bg-gray-100 px-1 rounded">{'{{rekening_agen}}'}</code> / <code className="bg-gray-100 px-1 rounded">{'{{nama_rekening_agen}}'}</code> buat rekening PENANDA TANGAN (beda tiap orang, jangan diisi manual).
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {DOKUMEN_LIST.map(d => (
          <button key={d.key} onClick={() => { setEditing(null); setDokumen(d.key); setLoadingPasal(true); }}
            className={`text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap ${dokumen === d.key ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {d.label}
          </button>
        ))}
      </div>

      {!loadingPasal && (
        <button onClick={() => setShowPreviewDokumen(v => !v)}
          className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-3 py-1.5 rounded-full mb-4">
          {showPreviewDokumen ? '▲ Sembunyikan Preview Dokumen Lengkap' : '👁️ Lihat Preview Dokumen Lengkap'}
        </button>
      )}
      </div>

      {!loadingPasal && showPreviewDokumen && signerForm && (
        <PreviewDokumenLengkap dokumen={dokumen} pasal={pasal} pengaturan={signerForm} />
      )}

      <div className="no-print">
      {loadingPasal ? (
        <div className="text-center text-gray-400 py-12">Memuat...</div>
      ) : (
        <>
          {editing?.isNew && (
            <div className="mb-3">
              <FormPasal editing={editing} setEditing={setEditing} saving={saving} showPreview={showPreview} setShowPreview={setShowPreview}
                onSimpan={simpanPasal} onBatal={() => setEditing(null)} onHapus={hapusPasal} />
            </div>
          )}
          <div className="space-y-2 mb-3">
            {pasal.map((p, i) => (
              editing && !editing.isNew && editing.nomor === p.nomor ? (
                <FormPasal key={p.nomor} editing={editing} setEditing={setEditing} saving={saving} showPreview={showPreview} setShowPreview={setShowPreview}
                  onSimpan={simpanPasal} onBatal={() => setEditing(null)} onHapus={hapusPasal} />
              ) : (
                <div key={p.nomor}
                  className="bg-white rounded-xl border border-gray-200 hover:border-[#1A4FA0] p-3 flex items-center gap-3">
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => geserPasal(p.nomor, 'naik')} disabled={i === 0 || reordering}
                      className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▲</button>
                    <button onClick={() => geserPasal(p.nomor, 'turun')} disabled={i === pasal.length - 1 || reordering}
                      className="text-gray-400 hover:text-[#1A4FA0] disabled:opacity-20 disabled:cursor-not-allowed leading-none px-1">▼</button>
                  </div>
                  <div onClick={() => mulaiEdit(p)} className="min-w-0 flex-1 cursor-pointer">
                    <div className="text-xs text-gray-400">{TIPE_LABEL[p.tipe] || 'Pasal'} {p.nomor}</div>
                    <div className="text-sm font-semibold text-gray-700 truncate">{p.judul}</div>
                  </div>
                  <span onClick={() => mulaiEdit(p)} className="text-xs font-bold text-[#1A4FA0] shrink-0 cursor-pointer">Edit →</span>
                </div>
              )
            ))}
          </div>
          {!editing && (
            <button onClick={mulaiTambah}
              className="w-full border-2 border-dashed border-gray-200 hover:border-[#1A4FA0] text-gray-400 hover:text-[#1A4FA0] text-sm font-bold py-3 rounded-xl transition-colors">
              + Tambah Pasal Baru
            </button>
          )}
        </>
      )}
      </div>

      {/* .no-print di atas nutup 2 blok konten non-preview (form
          penandatangan+tab dokumen di awal, list pasal edit di sini) — dulu
          diandelin "sembunyiin semua body*, absolute-in .print-area", ternyata
          position:absolute bikin Chrome gagal ngitung break-after:page pas
          print (2 .sheet logis ketumpuk 1 halaman fisik, bug nyata dari PDF
          user 2026-09-10). display:none via .no-print (sama kayak yang
          dipakai buat chrome Layout — sidebar/navbar, lihat Layout.jsx) gak
          punya efek samping itu.

          @page margin SENGAJA 0 (beda dari halaman cetak lain yang pakai
          15mm) — mesin pagination JS di atas ngitung budget tinggi tiap
          .sheet = 29.7cm PENUH dikurangi padding .sheet sendiri (40px)
          doang, gak tau-menau soal @page margin. Kalau @page masih kasih
          margin tambahan, area cetak beneran per lembar fisik jadi lebih
          pendek dari yang dihitung JS, jadi tiap .sheet logis malah
          meluber ke lembar fisik berikutnya (ketauan dari jumlah halaman
          pas print > jumlah "Halaman N/Total" yang keliatan di layar) —
          dikonfirmasi bug dari screenshot user 2026-09-10. Padding .sheet
          sendiri (~10.6mm) udah cukup jadi margin visual.
        */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          /* Offset sidebar (md:pl-64) & padding main Layout HARUS di-nol-in
             di sini juga — sidebar-nya sendiri udah .no-print, tapi
             ruang/offset yang dia sisain di elemen pembungkus TETAP
             kepakai kalau gak di-reset, jadi .sheet kegeser/kepotong ke
             kanan pas print (dikonfirmasi bug dari PDF user 2026-09-10,
             kejadian pas position:absolute .print-area yang lama dicabut). */
          .layout-shell { padding-left: 0 !important; }
          .layout-main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; break-after: page; }
          .sheet:last-child { break-after: auto; }
        }
        @page { size: A4; margin: 0; }
      `}</style>
    </Layout>
  );
}
