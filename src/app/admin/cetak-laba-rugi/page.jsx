'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const rp = (n) => Number(n || 0).toLocaleString('id-ID');
const NAMA_BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const th = { border: '1px solid #000', padding: '4px 6px', fontSize: 10, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' };
const td = { border: '1px solid #000', padding: '3px 6px', fontSize: 10 };
const tdLabel = { ...td, textAlign: 'left' };
const tdAngka = { ...td, textAlign: 'right' };
const tdHeader = { ...td, textAlign: 'left', fontWeight: 700, background: '#fafafa' };
const tdTotal = { ...td, textAlign: 'left', fontWeight: 700 };
const tdTotalAngka = { ...td, textAlign: 'right', fontWeight: 700 };

export default function CetakLabaRugi() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat...</div>}>
      <CetakLabaRugiInner />
    </Suspense>
  );
}

function CetakLabaRugiInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tahun = searchParams?.get('tahun') || '';
  const from = searchParams?.get('from') || '';
  const to = searchParams?.get('to') || '';
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const user = JSON.parse(u);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user.role !== 'super_admin') { setDitolak(true); setLoading(false); return; }

    const qs = new URLSearchParams();
    if (tahun) qs.set('tahun', tahun);
    else { if (from) qs.set('from', from); if (to) qs.set('to', to); }
    fetch(`/api/admin/laporan-keuangan-perusahaan?${qs}`).then(r => r.json())
      .then(a => { setPl(a); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tahun, from, to, router]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;
  if (ditolak) return <div style={{ padding: 40, fontFamily: 'Arial' }}>🔒 Khusus super admin.</div>;
  if (!pl) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Data tidak ditemukan.</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Laporan Laba Rugi{tahun ? ` (Tahun ${tahun})` : from || to ? ` (${from || '...'} s/d ${to || '...'})` : ''} · di dialog print pilih &quot;Save as PDF&quot;
        </div>
      </div>

      {tahun ? <SheetTahunan pl={pl} tahun={tahun} /> : <SheetBulanan pl={pl} from={from} to={to} />}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

function SheetBulanan({ pl, from, to }) {
  const totalBiaya = Number(pl.komisi || 0) + Number(pl.hpp || 0) + Number(pl.total_pengeluaran_operasional || 0) + Number(pl.total_reimburse_pending || 0);
  return (
    <div className="sheet" style={{ background: '#fff', width: 700, margin: '0 auto', padding: 30, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Laporan Laba Rugi</div>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 16 }}>
        {from || to ? `Periode: ${from || '...'} s/d ${to || '...'}` : 'Seluruh periode'}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Keterangan</th>
            <th style={{ ...th, width: 140 }}>Nominal</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={tdHeader}>PENDAPATAN</td><td style={td}></td></tr>
          <tr><td style={tdLabel}>Pendapatan Booking (bersih)</td><td style={tdAngka}>{rp(pl.pendapatan_booking)}</td></tr>
          {pl.pendapatan_lain_detail?.map(k => (
            <tr key={k.label}><td style={tdLabel}>{k.label}</td><td style={tdAngka}>{rp(k.total)}</td></tr>
          ))}
          <tr><td style={tdTotal}>Total Pendapatan</td><td style={tdTotalAngka}>{rp(pl.pendapatan_total)}</td></tr>

          <tr><td style={{ ...tdHeader, paddingTop: 10 }}>BIAYA</td><td style={{ ...td, paddingTop: 10 }}></td></tr>
          <tr><td style={tdLabel}>Komisi/Ujroh</td><td style={tdAngka}>{rp(pl.komisi)}</td></tr>
          <tr><td style={tdLabel}>HPP (Hotel/Maskapai/Vendor)</td><td style={tdAngka}>{rp(pl.hpp)}</td></tr>
          {pl.pengeluaran_operasional?.map(k => (
            <tr key={k.label}><td style={tdLabel}>{k.label}</td><td style={tdAngka}>{rp(k.total)}</td></tr>
          ))}
          {pl.reimburse_pending_detail?.map((k, i) => (
            <tr key={i}><td style={tdLabel}>{k.label} (belum dibayar)</td><td style={tdAngka}>{rp(k.total)}</td></tr>
          ))}
          <tr><td style={tdTotal}>Total Biaya</td><td style={tdTotalAngka}>{rp(totalBiaya)}</td></tr>

          <tr style={{ background: pl.laba_bersih_perusahaan >= 0 ? '#fff9c4' : '#fde2e2' }}>
            <td style={{ ...tdTotal, fontSize: 12 }}>LABA / RUGI</td>
            <td style={{ ...tdTotalAngka, fontSize: 12 }}>{rp(pl.laba_bersih_perusahaan)}</td>
          </tr>
        </tbody>
      </table>

      {pl.total_reimburse_pending > 0 && (
        <div style={{ fontSize: 9, color: '#888', marginTop: 10 }}>
          * Termasuk estimasi reimburse staff yang belum dibayar per tanggal cetak — akan digantikan transaksi
          cashflow asli begitu company membayarnya.
        </div>
      )}
    </div>
  );
}

function SheetTahunan({ pl, tahun }) {
  const jumlahkan = (arr) => arr.reduce((s, v) => s + Number(v || 0), 0);
  const baris = (label, arr, total, bold) => (
    <tr key={label} style={bold ? { fontWeight: 700 } : undefined}>
      <td style={bold ? tdTotal : tdLabel}>{label}</td>
      {arr.map((v, i) => <td key={i} style={bold ? tdTotalAngka : tdAngka}>{rp(v)}</td>)}
      <td style={tdTotalAngka}>{rp(total)}</td>
    </tr>
  );

  return (
    <div className="sheet" style={{ background: '#fff', width: 1000, margin: '0 auto', padding: 30, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Laporan Laba Rugi</div>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 16 }}>Tahun {tahun}</div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Keterangan</th>
            {pl.bulan_list.map(b => <th key={b} style={th}>{NAMA_BULAN_SINGKAT[Number(b.slice(5, 7)) - 1]}</th>)}
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={pl.bulan_list.length + 2} style={tdHeader}>PENDAPATAN</td></tr>
          {baris('Pendapatan Booking (bersih)', pl.pendapatan_booking, jumlahkan(pl.pendapatan_booking))}
          {pl.pendapatan_lain_rows.map(k => baris(k.label, k.per_bulan, k.total))}
          {baris('Total Pendapatan', pl.pendapatan_total, jumlahkan(pl.pendapatan_total), true)}

          <tr><td colSpan={pl.bulan_list.length + 2} style={{ ...tdHeader, paddingTop: 10 }}>BIAYA</td></tr>
          {baris('Komisi/Ujroh', pl.komisi, jumlahkan(pl.komisi))}
          {baris('HPP (Hotel/Maskapai/Vendor)', pl.hpp, jumlahkan(pl.hpp))}
          {pl.pengeluaran_rows.map(k => baris(k.label, k.per_bulan, k.total))}
          {pl.reimburse_rows.map(k => baris(`${k.label} (belum dibayar)`, k.per_bulan, k.total))}
          {baris('Total Biaya', pl.total_biaya, jumlahkan(pl.total_biaya), true)}

          <tr style={{ background: jumlahkan(pl.laba_rugi) >= 0 ? '#fff9c4' : '#fde2e2', fontWeight: 700 }}>
            <td style={{ ...tdTotal, fontSize: 12 }}>LABA / RUGI</td>
            {pl.laba_rugi.map((v, i) => <td key={i} style={{ ...tdTotalAngka, fontSize: 12 }}>{rp(v)}</td>)}
            <td style={{ ...tdTotalAngka, fontSize: 12 }}>{rp(jumlahkan(pl.laba_rugi))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
