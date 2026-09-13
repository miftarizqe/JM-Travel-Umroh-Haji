'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePengaturan } from '@/lib/usePengaturan';
import KopSurat from '@/app/components/KopSurat';
import { namaPengajuanPerwakilan } from '@/lib/pengajuanUjrohPerwakilan';

const STATUS_LABEL_PENGAJUAN = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const KATEGORI_LABEL = { ujroh_perwakilan: 'Ujroh Closing', reseller_perwakilan: 'Margin Reseller' };

const rp = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtTanggal = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTanggalJam = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const th = { border: '1px solid #000', padding: '4px 6px', fontSize: 10, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' };
const td = { border: '1px solid #000', padding: '3px 6px', fontSize: 10 };
const tdLabel = { ...td, textAlign: 'left' };
const tdAngka = { ...td, textAlign: 'right' };
const tdHeader = { ...td, textAlign: 'left', fontWeight: 700, background: '#fafafa' };
const tdTotal = { ...td, textAlign: 'left', fontWeight: 700 };
const tdTotalAngka = { ...td, textAlign: 'right', fontWeight: 700 };

// Dokumen pengajuan pencairan ujroh perwakilan ke direktur — mirror PERSIS
// /admin/cetak-rekap-ujroh (Sahabat Baitullah), bedanya dikelompokkan per
// PROGRAM bukan periode tanggal, dan SELALU butuh pengajuan_id (gak ada
// mode preview live).
export default function CetakRekapUjrohPerwakilan() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat...</div>}>
      <CetakRekapUjrohPerwakilanInner />
    </Suspense>
  );
}

function CetakRekapUjrohPerwakilanInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pengajuanId = searchParams.get('pengajuan_id');
  const [pengaturan] = usePengaturan();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [namaAdmin, setNamaAdmin] = useState('-');

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const user = JSON.parse(u);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user.role !== 'super_admin') { setDitolak(true); setLoading(false); return; }
    setNamaAdmin(user.name || '-');

    if (!pengajuanId) { setLoading(false); return; }
    fetch(`/api/admin/perwakilan/rekap-ujroh?pengajuan_id=${pengajuanId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router, pengajuanId]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;
  if (ditolak) return <div style={{ padding: 40, fontFamily: 'Arial' }}>🔒 Khusus super admin.</div>;
  if (!data?.pengajuan) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Data tidak ditemukan.</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Rekap Pencairan Ujroh Perwakilan · di dialog print pilih &quot;Save as PDF&quot;
        </div>
      </div>

      <div className="sheet" style={{ background: '#fff', width: 700, margin: '0 auto', padding: 30, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <KopSurat pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
          Rekap Pencairan Ujroh Perwakilan
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 16 }}>
          Dicetak {fmtTanggalJam(data.generated_at)}
          <div style={{ marginTop: 2 }}>
            {namaPengajuanPerwakilan(data.pengajuan)} (#{data.pengajuan.id})
            {data.pengajuan.tanggal_berangkat && ` · Berangkat ${fmtTanggal(data.pengajuan.tanggal_berangkat)}`}
            {' '}· Status: <b>{STATUS_LABEL_PENGAJUAN[data.pengajuan.status] || data.pengajuan.status}</b>
          </div>
        </div>

        {data.kelompok.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#888', padding: '30px 0' }}>
            Gak ada ujroh dalam pengajuan ini.
          </div>
        ) : (
          <>
            {data.kelompok.map(k => (
              <div key={k.penerima_id} style={{ marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <td colSpan={3} style={tdHeader}>
                        {k.penerima_nama} ({k.kode_unik})
                        <div style={{ fontWeight: 400, fontSize: 9, color: '#555', marginTop: 2 }}>
                          TF ke: <b>{k.bank ? `${k.bank} ${k.no_rekening}` : 'BELUM DIISI JAMAAH'}</b> a.n. <b>{k.nama_pemilik_rekening || k.penerima_nama}</b>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <th style={{ ...th, textAlign: 'left', width: 90 }}>Tanggal</th>
                      <th style={{ ...th, textAlign: 'left' }}>Keterangan</th>
                      <th style={{ ...th, width: 110 }}>Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {k.items.map(it => (
                      <tr key={it.id}>
                        <td style={tdLabel}>{fmtTanggal(it.created_at)}</td>
                        <td style={tdLabel}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#1A4FA0' }}>{KATEGORI_LABEL[it.jenis] || it.jenis}</span>
                          <div>{it.keterangan}</div>
                        </td>
                        <td style={tdAngka}>{rp(it.nominal)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} style={tdTotal}>Subtotal</td>
                      <td style={tdTotalAngka}>{rp(k.subtotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <tbody>
                <tr style={{ background: '#fff9c4' }}>
                  <td style={{ ...tdTotal, fontSize: 12, width: '70%' }}>TOTAL PENGAJUAN TRANSFER ({data.jumlah_baris} baris)</td>
                  <td style={{ ...tdTotalAngka, fontSize: 12 }}>{rp(data.grand_total)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50 }}>
          <div style={{ textAlign: 'center', fontSize: 12, width: 220 }}>
            <div style={{ height: 60 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontWeight: 700 }}>{namaAdmin}</div>
            <div style={{ color: '#666' }}>Diajukan oleh (Admin)</div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, width: 220 }}>
            <div style={{ height: 60 }}></div>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontWeight: 700 }}>
              {pengaturan.nama_penandatangan_keuangan || pengaturan.nama_penandatangan || '-'}
            </div>
            <div style={{ color: '#666' }}>
              Disetujui oleh ({pengaturan.jabatan_penandatangan_keuangan || pengaturan.jabatan_penandatangan || '-'})
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .sheet { box-shadow: none !important; margin: 0 auto !important; width: 100% !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </div>
  );
}
