'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import TombolWA from '@/app/components/TombolWA';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const KAMAR_LABEL = { quad: 'Quad', triple: 'Triple', double: 'Double' };
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const STATUS_LABEL = { estimasi: 'Baru Hitung', diajukan: 'Ajuan Budget' };
const STATUS_WARNA = { estimasi: 'bg-gray-100 text-gray-500', diajukan: 'bg-teal-100 text-teal-700' };
const TINDAK_LANJUT_LABEL = { baru: 'Baru', dihubungi: 'Dihubungi', selesai: 'Selesai' };
const TINDAK_LANJUT_WARNA = { baru: 'bg-red-100 text-red-700', dihubungi: 'bg-blue-100 text-blue-700', selesai: 'bg-green-100 text-green-700' };
const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };

// Rincian pilihan lengkap pengunjung (rute/hotel/malam/mutawwif/gender) —
// disimpen di kolom addon_config (JSON) begitu Kalkulator Estimasi Publik
// dikembangin nawarin pilihan lebih detail (2026-08-16), biar admin
// follow-up tau persis apa yang diminati, bukan cuma paket/kamar doang.
function RincianPilihan({ config }) {
  let c = config;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  if (!c) return null;
  const baris = [];
  if (c.rute) baris.push(`✈️ ${RUTE_LABEL[c.rute] || c.rute}`);
  if (c.hotel_mekkah) baris.push(`🏨 Mekkah: ${c.hotel_mekkah}`);
  if (c.hotel_madinah) baris.push(`🏨 Madinah: ${c.hotel_madinah}`);
  if (c.malam_mekkah || c.malam_madinah) baris.push(`🌙 ${c.malam_mekkah || 0}N Mekkah + ${c.malam_madinah || 0}N Madinah`);
  if (c.mutawwif_hari != null) baris.push(`🧭 Mutawwif ${c.mutawwif_hari} hari`);
  if (c.pakai_mutawwifah != null) baris.push(c.pakai_mutawwifah ? '👳‍♀️ Pakai Mutawwifah' : '🚫 Tanpa Mutawwifah');
  if (c.jumlah_cowok || c.jumlah_cewek) baris.push(`👥 ${c.jumlah_cowok || 0} cowok + ${c.jumlah_cewek || 0} cewek`);
  if (baris.length === 0 && !(c.kombinasi?.length > 0)) return null;
  return (
    <div className="mb-3">
      {baris.length > 0 && <div className="text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-1">{baris.map((b, i) => <span key={i}>{b}</span>)}</div>}
      {c.kombinasi?.length > 0 && (
        <div className="text-sm text-gray-500 mt-1">
          🛏️ {c.kombinasi.map((k, i) => (
            <span key={i}>{i > 0 && ', '}{k.jumlah}× {PAKET_LABEL[k.paket] || k.paket}/{KAMAR_LABEL[k.kamar] || k.kamar}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Halaman detail 1 lead kalkulator — dipisah dari list (sebelumnya semua
// numpuk di 1 kartu inline) supaya lebih rapi dibaca, mirip pola detail
// booking. Data yang ditampilkan SAMA seperti sebelumnya, cuma presentasinya
// dipisah (dikonfirmasi user 2026-08-21).
export default function KalkulatorLeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user] = useCurrentUser();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catatan, setCatatan] = useState('');
  const [rincian, setRincian] = useState(null);
  const [rincianTerbuka, setRincianTerbuka] = useState(false);
  const [rincianLoading, setRincianLoading] = useState(false);

  function muat() {
    fetch(`/api/admin/kalkulator-leads?id=${params.id}`)
      .then(r => r.json())
      .then(d => { setLead(d.lead || null); setCatatan(d.lead?.catatan_admin || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  if (!user || loading) {
    return <Layout title="🧮 Detail Ajuan Kalkulator" showBack><div className="flex items-center justify-center py-20 text-gray-400">Memuat...</div></Layout>;
  }
  if (!lead) {
    return <Layout title="🧮 Detail Ajuan Kalkulator" showBack><div className="text-center text-gray-400 py-20">Lead tidak ditemukan.</div></Layout>;
  }

  async function ubahTindakLanjut(statusBaru) {
    setSaving(true);
    await fetch('/api/admin/kalkulator-leads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, status_tindak_lanjut: statusBaru }),
    });
    setSaving(false);
    muat();
  }

  async function simpanCatatan() {
    if (catatan === (lead.catatan_admin || '')) return;
    setSaving(true);
    await fetch('/api/admin/kalkulator-leads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, catatan_admin: catatan }),
    });
    setSaving(false);
    muat();
  }

  async function bukaTutupRincian() {
    if (rincianTerbuka) { setRincianTerbuka(false); return; }
    setRincianTerbuka(true);
    if (rincian) return;
    setRincianLoading(true);
    const res = await fetch(`/api/admin/kalkulator-leads/${lead.id}/rincian`);
    const d = await res.json();
    setRincianLoading(false);
    if (res.ok) setRincian(d.lead);
  }

  // PDF rincian super_admin-only — pola sama persis unduhPdf() di
  // KalkulatorTerpadu.jsx (window.open kosong dulu biar gak keblokir popup
  // blocker, baru document.write HTML-nya).
  function unduhPdfRincian() {
    const r = rincian?.rincian_snapshot;
    if (!r) return;
    const tanggalCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const kamarList = ['quad', 'triple', 'double'];

    function htmlSatuRincian(rc, hpp, komisiFlat, kamarDipilih, hargaJualPerKamar) {
      const htmlKelompokItem = (label, list) => (list || []).length === 0 ? '' : list.map(g => `
        <h3>${label ? `${label} — ` : ''}${g.kelompok || g.nama}</h3>
        <table class="tbl">${g.items.map(it => `<tr><td>${it.nama}</td><td style="text-align:right">${rp(it.nilai)}</td></tr>`).join('')}
          <tr class="subtotal"><td>Subtotal</td><td style="text-align:right">${rp(g.subtotal)}</td></tr>
        </table>`).join('');
      const htmlLainLain = [
        rc.tiket > 0 ? `<tr><td>Tiket Pesawat</td><td style="text-align:right">${rp(rc.tiket)}</td></tr>` : '',
        rc.visa > 0 ? `<tr><td>Visa</td><td style="text-align:right">${rp(rc.visa)}</td></tr>` : '',
        rc.biaya_lain_lain > 0 ? `<tr><td>Biaya Lain-lain</td><td style="text-align:right">${rp(rc.biaya_lain_lain)}</td></tr>` : '',
        rc.biaya_umroh_tambahan > 0 ? `<tr><td>Biaya Umroh Tambahan</td><td style="text-align:right">${rp(rc.biaya_umroh_tambahan)}</td></tr>` : '',
      ].join('');
      const htmlPool = `<h3>Ringkasan Biaya per Pax</h3><table class="tbl">
        <tr><td>Total Item + Modul Negara (pool, ${rc.pax_jamaah} jamaah)</td><td style="text-align:right">${rp(rc.pool_total)}</td></tr>
        <tr><td>÷ ${rc.pax_jamaah} jamaah = per pax</td><td style="text-align:right">${rp(rc.pool_per_pax)}</td></tr>
        ${htmlLainLain}
        <tr style="font-weight:bold;background:#fff8e6"><td>Margin</td><td style="text-align:right">${rp(rc.margin)}</td></tr>
        <tr class="subtotal"><td>Biaya Tetap per Pax (sama semua tipe kamar)</td><td style="text-align:right">${rp(rc.biaya_tetap_per_pax)}</td></tr>
      </table>`;
      const htmlHotelHpp = `<h3>Hotel + HPP + Komisi + Harga Jual per Tipe Kamar</h3><table class="tbl">
        <tr><th>Tipe Kamar</th><th>Hotel/orang</th><th>Biaya Tetap/orang</th><th>HPP</th><th>Komisi</th><th>Harga Jual</th></tr>
        ${kamarList.map(k => {
          const hotelTotal = (rc.hotel[k] || []).reduce((s, h) => s + h.nilai, 0);
          return `<tr${k === kamarDipilih ? ' style="font-weight:bold;background:#eef4fb"' : ''}><td>${KAMAR_LABEL[k] || k}${k === kamarDipilih ? ' (dipilih)' : ''}</td><td style="text-align:right">${rp(hotelTotal)}</td><td style="text-align:right">${rp(rc.biaya_tetap_per_pax)}</td><td style="text-align:right">${rp(hpp[k])}</td><td style="text-align:right">${rp(komisiFlat)}</td><td style="text-align:right;font-weight:bold">${rp(hargaJualPerKamar[k])}</td></tr>`;
        }).join('')}
      </table>
      ${kamarList.map(k => (rc.hotel[k] || []).length === 0 ? '' : `<h3>Hotel — ${KAMAR_LABEL[k] || k}</h3><table class="tbl">${rc.hotel[k].map(h => `<tr><td>${h.nama}</td><td style="text-align:right">${rp(h.nilai)}</td></tr>`).join('')}</table>`).join('')}`;
      return `${htmlKelompokItem('', rc.kelompok)}${htmlKelompokItem('Modul Negara', rc.modul)}${htmlPool}${htmlHotelHpp}`;
    }

    let htmlUtama;
    if (r.mode === 'kombinasi') {
      htmlUtama = r.baris.map((b, i) => {
        const hargaJualPerKamar = Object.fromEntries(kamarList.map(k => [k, k === b.kamar ? b.harga_per_orang : Math.round(b.hpp[k] + r.komisi_flat)]));
        return `<h2 style="margin-top:20px">Kombinasi ${i + 1} — ${b.jumlah}× ${KAMAR_LABEL[b.kamar] || b.kamar}${b.hotel_mekkah ? ` · Mekkah: ${b.hotel_mekkah}${b.bintang_mekkah ? ` (★${b.bintang_mekkah})` : ''}` : ''}${b.hotel_madinah ? ` · Madinah: ${b.hotel_madinah}${b.bintang_madinah ? ` (★${b.bintang_madinah})` : ''}` : ''}</h2>
        <div class="total-jual" style="font-size:13px;margin-top:0">Subtotal Kombinasi ${i + 1}: ${rp(b.subtotal)} (${b.jumlah} × ${rp(b.harga_per_orang)}/orang)</div>
        ${htmlSatuRincian(b.rincian, b.hpp, r.komisi_flat, b.kamar, hargaJualPerKamar)}`;
      }).join('');
    } else {
      htmlUtama = htmlSatuRincian(r.rincian, r.hpp, r.komisi_flat, r.kamar, r.harga_jual);
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rincian — ${lead.user_nama}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;padding:24px;}
        h1{font-size:18px;margin:0 0 2px;} h2{font-size:12px;color:#666;font-weight:normal;margin:0 0 12px;}
        h3{font-size:12px;background:#f0f0f0;padding:5px 8px;margin:16px 0 4px;}
        table.tbl{width:100%;border-collapse:collapse;margin-bottom:2px;}
        table.tbl td,table.tbl th{border:1px solid #000;padding:4px 6px;text-align:left;}
        tr.subtotal{font-weight:bold;background:#f7f7f7;}
        .total-jual{font-size:16px;font-weight:bold;margin-top:16px;padding:10px;background:#E8F0FB;border-radius:6px;}
        .btn-download{position:fixed;top:16px;right:16px;background:#1A4FA0;color:#fff;border:none;padding:10px 18px;
          border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);}
        .btn-download:hover{background:#0E2F6E;}
        @media print{ @page{size:A4;margin:16mm;} .btn-download{display:none;} }
      </style></head><body>
      <button type="button" class="btn-download" onclick="window.print()">📄 Download PDF</button>
      <h1>${lead.template_nama || 'Kalkulator Estimasi Publik'}</h1>
      <h2>${lead.user_nama} · ${lead.user_email}${lead.user_wa ? ` · ${lead.user_wa}` : ''} — dicetak ${tanggalCetak}</h2>
      ${htmlUtama}
      <div class="total-jual">Total Harga Jual: ${rp(r.total)}</div>
      <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });</script>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Popup diblokir browser — izinkan popup buat halaman ini dulu.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  const inp = "px-2 py-1.5 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";

  return (
    <Layout title="🧮 Detail Ajuan Kalkulator" showBack backHref="/admin/kalkulator-leads">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <div className="font-bold text-[#0E2F6E] text-lg">{lead.user_nama}</div>
              <div className="text-sm text-gray-400">{lead.user_email} {lead.user_wa ? `· ${lead.user_wa}` : ''}</div>
            </div>
            <div className="flex gap-2">
              {lead.tipe === 'custom' && <span className="text-xs font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">🎨 Custom</span>}
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_WARNA[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${TINDAK_LANJUT_WARNA[lead.status_tindak_lanjut]}`}>{TINDAK_LANJUT_LABEL[lead.status_tindak_lanjut]}</span>
            </div>
          </div>

          {lead.tipe === 'custom' ? (
            <>
              <div className="text-sm text-gray-600 mb-2 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{lead.catatan_custom}</div>
              <div className="text-xs text-gray-400 mb-4">
                {lead.tanggal_berangkat && <>Berangkat {tgl(lead.tanggal_berangkat)}</>}
                {lead.tanggal_berangkat && lead.jumlah_pax && ' · '}
                {lead.jumlah_pax && <>{lead.jumlah_pax} pax</>}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-semibold">{lead.template_nama}</span> — {lead.paket === 'campuran' ? 'Campuran (lihat rincian)' : `${PAKET_LABEL[lead.paket] || lead.paket} / ${KAMAR_LABEL[lead.kamar] || lead.kamar}`}
                {lead.tanggal_berangkat && <> · Berangkat {tgl(lead.tanggal_berangkat)}</>}
              </div>
              <RincianPilihan config={lead.addon_config} />
              <div className="text-2xl font-black text-[#1A4FA0] mb-4">{rp(lead.harga_jual)}</div>

              {user.role === 'super_admin' && (
                <div className="mb-4">
                  <button type="button" onClick={bukaTutupRincian} className="text-sm font-bold text-[#1A4FA0] hover:underline">
                    {rincianLoading ? 'Memuat rincian...' : rincianTerbuka ? '▲ Tutup Rincian HPP/Margin/Komisi' : '📊 Lihat Rincian HPP/Margin/Komisi'}
                  </button>
                  {rincianTerbuka && rincian && (
                    <div className="mt-2 bg-gray-50 rounded-lg p-4 text-sm">
                      {(() => {
                        const r = rincian.rincian_snapshot;
                        if (!r) return <div className="text-gray-400">Rincian gak tersedia buat lead ini (dihitung sebelum fitur ini ada).</div>;
                        return (
                          <>
                            <div className="text-gray-500 mb-2">Margin Flat {rp(r.margin_flat)} · Komisi Flat {rp(r.komisi_flat)}</div>
                            {r.mode === 'kombinasi' ? r.baris.map((b, i) => (
                              <div key={i} className="mb-3 pb-3 border-b border-gray-200 last:border-0 last:mb-0 last:pb-0">
                                <div className="font-bold text-[#0E2F6E] mb-1">Kombinasi {i + 1} — {b.jumlah}× {KAMAR_LABEL[b.kamar] || b.kamar}</div>
                                <div className="text-gray-500">HPP/orang {rp(b.hpp[b.kamar])} + Komisi {rp(r.komisi_flat)} = Jual {rp(b.harga_per_orang)}/orang · Subtotal {rp(b.subtotal)}</div>
                              </div>
                            )) : (
                              <div className="text-gray-500">HPP ({KAMAR_LABEL[r.kamar] || r.kamar}) {rp(r.hpp[r.kamar])} + Komisi {rp(r.komisi_flat)} = Jual {rp(r.harga_jual[r.kamar])}</div>
                            )}
                            <div className="font-bold text-[#0E2F6E] mt-2">Total: {rp(r.total)}</div>
                            <button type="button" onClick={unduhPdfRincian} className="mt-3 text-xs font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] px-3 py-1.5 rounded-lg">📄 Download PDF Rincian</button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="text-xs text-gray-400 mb-4">
            Dihitung {tgl(lead.created_at)}{lead.diajukan_at && <> · Ajuan budget {tgl(lead.diajukan_at)}</>}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <TombolWA nomor={lead.user_wa} label="Follow Up"
              pesan={lead.tipe === 'custom'
                ? `Halo ${lead.user_nama}, terima kasih sudah ajukan permintaan custom di Kalkulator JM Travel. Kami bantu susunkan & quote-kan ya!`
                : `Halo ${lead.user_nama}, terima kasih sudah coba estimasi ${lead.template_nama} di Kalkulator JM Travel (${rp(lead.harga_jual)}). Ada yang bisa kami bantu?`} />
            <select value={lead.status_tindak_lanjut} disabled={saving} onChange={e => ubahTindakLanjut(e.target.value)} className={inp}>
              <option value="baru">Baru</option>
              <option value="dihubungi">Dihubungi</option>
              <option value="selesai">Selesai</option>
            </select>
          </div>

          <label className="block text-xs font-semibold text-gray-500 mb-1">Catatan follow-up</label>
          <textarea value={catatan} onChange={e => setCatatan(e.target.value)} onBlur={simpanCatatan}
            placeholder="Catatan follow-up (opsional)..." rows={3} className={`${inp} w-full`} />
        </div>
      </div>
    </Layout>
  );
}
