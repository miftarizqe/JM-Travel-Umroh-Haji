'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePengaturan } from '@/lib/usePengaturan';
import KopSurat from '@/app/components/KopSurat';
import { namaPengajuan } from '@/lib/pengajuanUjroh';

const STATUS_LABEL_PENGAJUAN = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };

const rp = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtTanggal = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtTanggalJam = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const KATEGORI_LABEL = {
  komisi_sahabat: 'Ujroh Rekrutan',
  closing_langsung_sahabat: 'Closing Jamaah',
  tabungan_awal_sahabat: 'Saldo Awal Pendaftaran',
  head_of_program_registrasi: 'Ujroh Head of Program',
};

const th = { border: '1px solid #000', padding: '4px 6px', fontSize: 10, fontWeight: 700, textAlign: 'center', background: '#f0f0f0' };
const td = { border: '1px solid #000', padding: '3px 6px', fontSize: 10 };
const tdLabel = { ...td, textAlign: 'left' };
const tdAngka = { ...td, textAlign: 'right' };
const tdHeader = { ...td, textAlign: 'left', fontWeight: 700, background: '#fafafa' };
const tdTotal = { ...td, textAlign: 'left', fontWeight: 700 };
const tdTotalAngka = { ...td, textAlign: 'right', fontWeight: 700 };

// Dokumen pengajuan mingguan ke direktur — rekap SEMUA ujroh Sahabat
// Baitullah yang masih pending (belum ditransfer), dikelompokkan per
// penerima biar langsung actionable buat eksekusi TF. Pola HTML+print sama
// persis /admin/cetak-laba-rugi (bukan react-pdf — itu buat dokumen legal
// bertanda tangan digital, beda konteks dari laporan internal kayak ini).
export default function CetakRekapUjroh() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat...</div>}>
      <CetakRekapUjrohInner />
    </Suspense>
  );
}

function CetakRekapUjrohInner() {
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

    const qs = pengajuanId ? `?pengajuan_id=${pengajuanId}` : '';
    fetch(`/api/admin/sahabat/komisi-rekap${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router, pengajuanId]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Memuat data...</div>;
  if (ditolak) return <div style={{ padding: 40, fontFamily: 'Arial' }}>🔒 Khusus super admin.</div>;
  if (!data) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Data tidak ditemukan.</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#eee', minHeight: '100vh', padding: '20px 0' }}>
      <div className="no-print" style={{ textAlign: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1A4FA0', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 20, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          🖨️ Print / Save PDF
        </button>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Rekap Pengajuan Transfer Ujroh · di dialog print pilih &quot;Save as PDF&quot;
        </div>
      </div>

      <div className="sheet" style={{ background: '#fff', width: 700, margin: '0 auto', padding: 30, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
        <KopSurat pengaturan={pengaturan} />

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
          Rekap Pengajuan Transfer Ujroh
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 16 }}>
          Program Sahabat Baitullah · Dicetak {fmtTanggalJam(data.generated_at)}
          {data.periode && (
            <div style={{ marginTop: 2 }}>
              {data.pengajuan ? `${namaPengajuan(data.pengajuan)} (#${data.pengajuan.id}) · ` : `Periode ${fmtTanggal(data.periode.mulai)} – ${fmtTanggal(data.periode.selesai)} · `}
              {data.pengajuan && <>Status: <b>{STATUS_LABEL_PENGAJUAN[data.pengajuan.status] || data.pengajuan.status}</b></>}
              {!data.pengajuan && <span style={{ fontStyle: 'italic' }}>preview live, belum jadi pengajuan resmi</span>}
            </div>
          )}
        </div>

        {data.kelompok.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#888', padding: '30px 0' }}>
            Gak ada ujroh yang pending saat ini — semua sudah ditransfer & dikonfirmasi.
          </div>
        ) : (
          <>
            {data.kelompok.map(k => {
              // Dikelompokkan PER REKENING SUMBER (dikonfirmasi user
              // 2026-10-21) — bukan badge per baris lagi. Closing Sahabat
              // Baitullah & Closing Program (reguler) masing-masing tabel
              // + subtotal sendiri (1 penerima bisa punya 2 angka beda),
              // grup yang kosong gak dirender.
              const grup = [
                { key: 'sahabat_baitullah', label: 'Closing Sahabat Baitullah', warna: '#7e22ce' },
                { key: 'alkhalid', label: 'Closing Program (Reguler)', warna: '#1A4FA0' },
              ].map(g => ({ ...g, items: k.items.filter(it => it.rekening === g.key) })).filter(g => g.items.length > 0);
              return (
                <div key={k.penerima_id} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#0E2F6E', marginBottom: 2 }}>
                    {k.penerima_nama} ({k.kode_unik})
                  </div>
                  <div style={{ fontWeight: 400, fontSize: 9, color: '#555', marginBottom: 4 }}>
                    TF ke No. Rek. Tabungan Umroh: <b>{k.no_rekening_tabungan_umroh || 'BELUM DIISI JAMAAH'}</b> a.n. <b>{k.penerima_nama}</b>
                  </div>
                  {grup.map(g => (
                    <table key={g.key} style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
                      <thead>
                        <tr>
                          <td colSpan={3} style={{ ...tdHeader, color: g.warna }}>{g.label}</td>
                        </tr>
                        <tr>
                          <th style={{ ...th, textAlign: 'left', width: 90 }}>Tanggal</th>
                          <th style={{ ...th, textAlign: 'left' }}>Keterangan</th>
                          <th style={{ ...th, width: 110 }}>Nominal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map(it => (
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
                          <td colSpan={2} style={{ ...tdTotal, color: g.warna }}>Subtotal — Sumber Rekening {g.key === 'alkhalid' ? 'Utama (Alkhalid)' : 'Sahabat Baitullah'}</td>
                          <td style={{ ...tdTotalAngka, color: g.warna }}>{rp(k.subtotal_per_rekening[g.key])}</td>
                        </tr>
                      </tbody>
                    </table>
                  ))}
                </div>
              );
            })}

            {/* Breakdown rekening keseluruhan — tetap ditampilin walau cuma
                1 rekening yang kepakai (transparansi "dana ini dari mana"),
                di atas TOTAL biar kebaca duluan sebelum TTD. */}
            {data.grand_total_per_rekening && (data.grand_total_per_rekening.alkhalid > 0 || data.grand_total_per_rekening.sahabat_baitullah > 0) && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <tbody>
                  {data.grand_total_per_rekening.alkhalid > 0 && (
                    <tr>
                      <td style={{ ...tdTotal, width: '70%', color: '#1A4FA0' }}>Sumber Dana — Rekening Alkhalid</td>
                      <td style={{ ...tdTotalAngka, color: '#1A4FA0' }}>{rp(data.grand_total_per_rekening.alkhalid)}</td>
                    </tr>
                  )}
                  {data.grand_total_per_rekening.sahabat_baitullah > 0 && (
                    <tr>
                      <td style={{ ...tdTotal, width: '70%', color: '#7e22ce' }}>Sumber Dana — Rekening Sahabat Baitullah</td>
                      <td style={{ ...tdTotalAngka, color: '#7e22ce' }}>{rp(data.grand_total_per_rekening.sahabat_baitullah)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

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
              {pengaturan.nama_penandatangan_keuangan || '-'}
            </div>
            <div style={{ color: '#666' }}>
              Disetujui oleh ({pengaturan.jabatan_penandatangan_keuangan || '-'})
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
