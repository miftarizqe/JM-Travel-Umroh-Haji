'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import KopSurat from '@/app/components/KopSurat';
import { usePengaturan } from '@/lib/usePengaturan';
import { useCurrentUser } from '@/lib/useCurrentUser';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';

export default function CetakTandaTerimaPerlengkapan() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params?.booking_id ? decodeURIComponent(params.booking_id) : '';
  const idx = params?.idx;

  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { setDitolak(true); setLoading(false); return; }
    fetch(`/api/admin/perlengkapan-pengiriman/tanda-terima?booking_id=${encodeURIComponent(bookingId)}&idx=${idx}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, bookingId, idx]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;

  if (ditolak) return (
    <div style={{ padding: 40, fontFamily: 'Arial', textAlign: 'center' }}>
      <h2 style={{ color: '#dc2626' }}>🔒 Akses Ditolak</h2>
      <p style={{ color: '#666', fontSize: 14 }}>Cetak tanda terima hanya dapat diakses oleh admin.</p>
      <button onClick={() => router.back()} style={{ marginTop: 16, background: '#1A4FA0', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 20, cursor: 'pointer' }}>← Kembali</button>
    </div>
  );

  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Data tidak ditemukan — pastikan perlengkapan sudah ditandai &quot;Dikirim&quot;.</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>{data.nama} · di dialog print pilih &quot;Save as PDF&quot;</div>
      </div>

      <div className="sheet" style={{ background: '#fff', width: 720, margin: '0 auto', padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <KopSurat pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: 0.5, color: '#0E2F6E' }}>TANDA TERIMA PERLENGKAPAN</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 24 }}>
          {data.booking_id} · Dikirim: {tgl(data.dikirim_at)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 20 }}>
          <div>
            Diterima oleh:<br /><b>{data.nama}</b>
          </div>
          <div style={{ textAlign: 'right' }}>
            Program:<br /><b>{data.prog_name || '-'}</b>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 30 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '6px 8px', background: '#f0f0f0', textAlign: 'left', width: 50 }}>No</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', background: '#f0f0f0', textAlign: 'left' }}>Nama Item</th>
              <th style={{ border: '1px solid #000', padding: '6px 8px', background: '#f0f0f0', textAlign: 'center', width: 80 }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr><td colSpan={3} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', color: '#999' }}>Belum ada item tercatat.</td></tr>
            ) : data.items.map((it, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px' }}>{it.nama}</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center' }}>{it.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 30 }}>
          Dengan ini saya menyatakan telah menerima seluruh perlengkapan yang tercantum di atas dalam kondisi baik dan lengkap.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div>Yang Menyerahkan</div>
            <div style={{ fontWeight: 700 }}>JM Travel</div>
            <div style={{ height: 60 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>(...........................)</div>
          </div>
          <div style={{ textAlign: 'center', width: '45%' }}>
            <div>Yang Menerima</div>
            <div style={{ fontWeight: 700 }}>Jamaah / Wakil</div>
            <div style={{ height: 60 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>({data.nama})</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
        }
        @page { size: 210mm 297mm; margin: 15mm; }
      `}</style>
    </div>
  );
}
