'use client';
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { hitungPrintRows } from '@/lib/cashflow';
import EditBonModal from './EditBonModal';

const rp = (n) => Number(n || 0).toLocaleString('id-ID');
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const namaBulan = (b) => {
  if (!b) return '-';
  const [y, m] = b.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const th = { border: '1px solid #000', padding: '4px 6px', fontSize: 10, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' };
const td = { border: '1px solid #000', padding: '3px 6px', fontSize: 10 };
const isGambar = (path) => /\.(jpe?g|png|gif|webp)$/i.test(path || '');

// Lampiran bon: tiap baris = 1 <div> flex (BUKAN <table>). Sempat dicoba
// pakai <table> biar dapet auto-sizing "lebar ikut terlebar, tinggi ikut
// tertinggi" gratis dari browser — tapi break-inside:avoid di <tr> gak
// reliable pas isinya gambar (dukungan browser buat pagination row tabel
// suka diabaikan), hasilnya foto malah kepotong tengah pas ganti halaman.
// Div flex per baris dapet efek sizing yang sama (flex item nge-stretch ke
// tinggi item tertinggi di baris itu secara default) TAPI break-inside:avoid
// jauh lebih reliable di elemen blok biasa.
const BON_KOLOM = 3;
const BON_MAKS_TINGGI_MM = 90;

function kelompokkan(arr, ukuran) {
  const hasil = [];
  for (let i = 0; i < arr.length; i += ukuran) hasil.push(arr.slice(i, i + ukuran));
  return hasil;
}

export default function CetakCashflow() {
  const params = useParams();
  const periodeId = params?.id;
  const [user] = useCurrentUser();
  const [periode, setPeriode] = useState(null);
  const [saldo, setSaldo] = useState([]);
  const [akunList, setAkunList] = useState([]);
  const [transaksi, setTransaksi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [gambarSiap, setGambarSiap] = useState(new Set());
  const [editingBon, setEditingBon] = useState(null);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user.role !== 'super_admin') { setDitolak(true); setLoading(false); return; }

    Promise.all([
      fetch(`/api/admin/cashflow/periode/${periodeId}`).then(r => r.json()),
      fetch('/api/admin/cashflow/akun').then(r => r.json()),
      fetch(`/api/admin/cashflow/transaksi?periode_id=${periodeId}`).then(r => r.json()),
    ]).then(([p, a, t]) => {
      setPeriode(p.periode); setSaldo(p.saldo || []);
      setAkunList(a.akun || []); setTransaksi(t.transaksi || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, periodeId]);

  async function simpanHasilEditBon(t, hasil) {
    try {
      const res = await fetch('/api/admin/cashflow/transaksi', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, bukti_path: hasil.bukti_path, bukti_nama: hasil.bukti_nama }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan foto'); return; }
      setTransaksi(prev => prev.map(x => x.id === t.id ? { ...x, bukti_path: hasil.bukti_path, bukti_nama: hasil.bukti_nama } : x));
      // foto ganti -> tunggu lagi sampai foto barunya kemuat sebelum print
      setGambarSiap(new Set());
    } finally {
      setEditingBon(null);
    }
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;
  if (ditolak) return <div style={{ padding: 40, fontFamily: 'Arial' }}>🔒 Khusus super admin.</div>;
  if (!periode) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Periode tidak ditemukan.</div>;

  const printRows = hitungPrintRows(transaksi);
  const bonList = printRows.filter(t => t.bukti_path);
  const totalGambar = bonList.filter(t => isGambar(t.bukti_path)).length;
  const semuaGambarSiap = gambarSiap.size >= totalGambar;
  const tandaiGambarSiap = (id) => setGambarSiap(prev => prev.has(id) ? prev : new Set(prev).add(id));
  const barisBon = kelompokkan(bonList, BON_KOLOM);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()} disabled={!semuaGambarSiap}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: semuaGambarSiap ? 'pointer' : 'not-allowed', fontSize: 14, opacity: semuaGambarSiap ? 1 : 0.6 }}>
          {semuaGambarSiap ? '🖨️ Print / Save PDF' : `⏳ Memuat gambar bon (${gambarSiap.size}/${totalGambar})...`}
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Cashflow {namaBulan(periode.bulan)} · di dialog print pilih &quot;Save as PDF&quot; dan orientasi Landscape
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          Mode tampilan tiap transfer ke staff (rincian/totalan) diatur di halaman edit cashflow, bukan di sini.
        </div>
        {!semuaGambarSiap && (
          <div style={{ fontSize: 11, color: '#c9952a', marginTop: 4 }}>
            Tunggu semua gambar bon selesai dimuat dulu, biar nggak putih pas di-print/save PDF.
          </div>
        )}
      </div>

      <div className="sheet" style={{ background: '#fff', width: 1000, margin: '0 auto 20px', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{namaBulan(periode.bulan)}</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          {/* colgroup, BUKAN width per <td> — table-layout:fixed pakai lebar
              kolom dari sini, jadi kolom OUT/IN semua akun tetap sama lebar
              persis baik ada isinya atau kosong, gak ngikut auto-fit konten. */}
          <colgroup>
            <col style={{ width: 26 }} />
            <col style={{ width: 74 }} />
            <col />
            {akunList.map(a => (
              <Fragment key={a.id}>
                <col style={{ width: 68 }} />
                <col style={{ width: 68 }} />
              </Fragment>
            ))}
          </colgroup>
          <thead>
            <tr>
              <th style={th} rowSpan={2}>No</th>
              <th style={{ ...th, whiteSpace: 'nowrap' }} rowSpan={2}>Tanggal</th>
              <th style={th} rowSpan={2}>Deskripsi</th>
              {akunList.map(a => <th key={a.id} style={th} colSpan={2}>{a.nama}</th>)}
            </tr>
            <tr>
              {akunList.map(a => (
                <Fragment key={a.id}>
                  <th style={th}>OUT</th>
                  <th style={th}>IN</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#f8f9fd' }}>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>SALDO AWAL</td>
              {akunList.map(a => {
                const s = saldo.find(x => x.akun_id === a.id);
                return <td key={a.id} style={{ ...td, textAlign: 'right', fontWeight: 700 }} colSpan={2}>{rp(s?.saldo_awal)}</td>;
              })}
            </tr>
            {printRows.map((t, idx) => (
              <tr key={t.id}>
                <td style={{ ...td, textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{tgl(t.tanggal)}</td>
                <td style={td}>{t.deskripsi}{t.kategori_nama ? ` (${t.kategori_nama})` : ''}</td>
                {akunList.map(a => (
                  <Fragment key={a.id}>
                    <td style={{ ...td, textAlign: 'right' }}>{t.akun_id === a.id && t.tipe === 'out' ? rp(t.nominal) : ''}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{t.akun_id === a.id && t.tipe === 'in' ? rp(t.nominal) : ''}</td>
                  </Fragment>
                ))}
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>TOTAL MASUK</td>
              {akunList.map(a => {
                const s = saldo.find(x => x.akun_id === a.id);
                return <td key={a.id} style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#16a34a' }} colSpan={2}>{rp(s?.total_in)}</td>;
              })}
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>TOTAL KELUAR</td>
              {akunList.map(a => {
                const s = saldo.find(x => x.akun_id === a.id);
                return <td key={a.id} style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#dc2626' }} colSpan={2}>{rp(s?.total_out)}</td>;
              })}
            </tr>
            <tr style={{ background: '#f8f9fd' }}>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>SALDO AKHIR</td>
              {akunList.map(a => {
                const s = saldo.find(x => x.akun_id === a.id);
                return (
                  <td key={a.id} style={{ ...td, textAlign: 'right', fontWeight: 700 }} colSpan={2}>{rp(s?.saldo_akhir)}</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {bonList.length > 0 && (
        <div className="sheet" style={{ background: '#fff', width: 1000, margin: '0 auto 20px', padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Lampiran Bon — {namaBulan(periode.bulan)}</div>
          {barisBon.map((baris, i) => (
            // className di baris (bukan per-kartu) — SELURUH baris ini yang
            // jadi 1 unit gak-boleh-kepotong; kalau gak muat di halaman
            // sekarang, seluruh barisnya pindah utuh ke halaman berikutnya.
            <div key={i} className="bon-baris" style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              {baris.map(t => (
                <div key={t.id} className="bon-item"
                  style={{ position: 'relative', border: '1px solid #ccc', padding: 6, fontSize: 8, flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.deskripsi}</div>
                  <div style={{ color: '#666', marginBottom: 3, whiteSpace: 'nowrap' }}>{tgl(t.tanggal)} · Rp {rp(t.nominal)}</div>
                  {isGambar(t.bukti_path) ? (
                    // maxHeight cuma jaga-jaga (1 foto raksasa jangan sampai
                    // 1 baris jadi berhalaman-halaman) — dalam batas itu,
                    // tinggi/lebar ngikutin rasio asli, gak dipotong. Flex
                    // row-nya (default align-items:stretch) otomatis
                    // nyamain tinggi semua kartu di baris ini ke yg
                    // tertinggi.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.bukti_path} alt="bon" style={{ maxWidth: '100%', maxHeight: `${BON_MAKS_TINGGI_MM}mm`, height: 'auto', width: 'auto', display: 'block' }}
                      onLoad={() => tandaiGambarSiap(t.id)} onError={() => tandaiGambarSiap(t.id)} />
                  ) : (
                    <div style={{ color: '#888' }}>📄 File terlampir: {t.bukti_nama}</div>
                  )}
                  {isGambar(t.bukti_path) && (
                    <button type="button" className="no-print" onClick={() => setEditingBon(t)}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 9, fontWeight: 700, padding: '3px 8px', cursor: 'pointer' }}>
                      ✏️ Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {editingBon && (
        <EditBonModal
          imgSrc={editingBon.bukti_path}
          namaAsli={editingBon.bukti_nama}
          onClose={() => setEditingBon(null)}
          onSaved={(hasil) => simpanHasilEditBon(editingBon, hasil)}
        />
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
          .sheet + .sheet { page-break-before: always; }
          /* baris tabel ledger & tiap baris lampiran bon jangan sampai
             kepotong di tengah pas pindah halaman — kalau gak muat utuh,
             seluruh barisnya dilempar ke halaman berikutnya, bukan
             dipotong separuh. */
          tbody tr { break-inside: avoid; page-break-inside: avoid; }
          .bon-baris { break-inside: avoid; page-break-inside: avoid; }
        }
        /* Dimensi eksplisit (297mm x 210mm = A4 landscape), BUKAN keyword
           "A4 landscape" — sebagian browser gak konsisten nge-set default
           Orientation ke Landscape di dialog print kalau pake keyword,
           jadinya kepilih Portrait dan tabel lebar ini kepaksa muat di
           kertas sempit -> meluber jadi banyak halaman kosong. Dimensi
           eksplisit lebih reliable dikenali sebagai "halaman ini landscape".
           Margin: kiri/kanan 0.5cm, atas 1cm, bawah 0.5cm (asumsi cm — kalau
           maksudnya inch, tinggal bilang). */
        @page { size: 297mm 210mm; margin-top: 1cm; margin-bottom: 0.5cm; margin-left: 0.5cm; margin-right: 0.5cm; }
      `}</style>
    </div>
  );
}
