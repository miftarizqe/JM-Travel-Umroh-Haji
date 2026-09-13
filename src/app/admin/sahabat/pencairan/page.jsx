'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';
import { namaPengajuan } from '@/lib/pengajuanUjroh';

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function fmtTanggal(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toISODate(d) { return d.toISOString().slice(0, 10); }

const STATUS_LABEL = { draft: 'Draft', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const STATUS_WARNA = {
  draft: 'bg-gray-100 text-gray-500', diajukan: 'bg-yellow-100 text-yellow-700',
  disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700',
};

// Halaman baru 2026-08-29 — konsolidasi semua hal "pencairan ujroh/komisi"
// yang tadinya numpang di Pendaftaran (tombol cetak rekap) & tersebar di
// beberapa stat card berbeda, jadi 1 section sendiri (Pengaturan Komisi
// udah punya halaman sendiri juga, gak perlu digabung ke sini). Diperluas
// 2026-08-30 (Fase 2) — sekarang rekap jadi BATCH PERSISTEN
// (pengajuan_ujroh) yang bisa di-track draft→diajukan→disetujui/ditolak,
// bukan cuma preview live sekali-print-hilang lagi.
export default function PencairanKomisiPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isAdminOrHop, checked: hopChecked } = useIsHop(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pengajuan, setPengajuan] = useState([]);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [periodeMulai, setPeriodeMulai] = useState('');
  const [periodeSelesai, setPeriodeSelesai] = useState('');
  const isSuperAdmin = user?.role === 'super_admin';

  function muat() {
    fetch('/api/admin/sahabat/pencairan-ringkasan').then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/admin/sahabat/pengajuan-ujroh').then(r => r.json()).then(d => {
      setPengajuan(d.pengajuan || []);
    }).catch(() => {});
  }

  useEffect(() => {
    if (!user || !hopChecked) return;
    if (!isAdminOrHop) { router.replace('/login'); return; }
    muat();
  }, [user, hopChecked, isAdminOrHop]);

  // Buka form periode — default "dari" = sehari setelah periode_selesai
  // pengajuan terakhir yang masih berlaku (status != ditolak, periodenya
  // gak bisa dipakai ulang), biar cakupan periode nyambung terus tanpa
  // bolong/tumpang tindih. Gak ada pengajuan sebelumnya → default 7 hari
  // ke belakang. "Sampai" selalu default hari ini.
  function bukaForm() {
    const berlaku = pengajuan.filter(p => p.status !== 'ditolak');
    const selesaiTerakhir = berlaku.length > 0
      ? berlaku.reduce((max, p) => (!max || p.periode_selesai > max) ? p.periode_selesai : max, null)
      : null;
    const hariIni = new Date();
    let mulai;
    if (selesaiTerakhir) {
      mulai = new Date(selesaiTerakhir);
      mulai.setDate(mulai.getDate() + 1);
    } else {
      mulai = new Date(hariIni);
      mulai.setDate(mulai.getDate() - 7);
    }
    setPeriodeMulai(toISODate(mulai));
    setPeriodeSelesai(toISODate(hariIni));
    setShowForm(true);
  }

  async function buatPengajuan() {
    if (!periodeMulai || !periodeSelesai) { alert('Pilih periode dari–sampai dulu'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/sahabat/pengajuan-ujroh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode_mulai: periodeMulai, periode_selesai: periodeSelesai }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setCreating(false); return; }
      setShowForm(false);
      muat();
      router.push(`/admin/sahabat/pencairan/${d.pengajuan_id}`);
    } catch { alert('Terjadi kesalahan'); }
    setCreating(false);
  }

  // Tanggal yang udah kepakai pengajuan lain (status != ditolak) — dipagerin
  // dari input date lewat atribut `min`/`max` per field gak cukup buat
  // block rentang di TENGAH, jadi validasi utama tetap di server (pesan
  // error jelas overlap sama pengajuan mana) — daftar ini cuma buat admin
  // liat sekilas sebelum milih tanggal.
  const periodeTerpakai = pengajuan.filter(p => p.status !== 'ditolak');

  if (!user || !hopChecked || !isAdminOrHop) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="💸 Pencairan Komisi" backHref="/admin/sahabat">
      <div className="text-xs text-gray-400 mb-4">
        Ringkasan ujroh/komisi Sahabat Baitullah — sudah dibayar, masih pending, dan batch pengajuan mingguan buat approval direktur sebelum eksekusi transfer.
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <div className="text-base font-bold text-green-600">{fmtRp(data?.terbayar)}</div>
              <div className="text-[10px] text-gray-400">Komisi Terbayar</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <div className="text-base font-bold text-yellow-600">{fmtRp(data?.belum_diajukan_total)}</div>
              <div className="text-[10px] text-gray-400">Belum Diajukan</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <div className="text-xl font-bold text-[#0E2F6E]">{data?.belum_diajukan_count ?? 0}</div>
              <div className="text-[10px] text-gray-400">Baris Belum Diajukan</div>
            </div>
          </div>
          {/* pending_total/pending_count (SEMUA yang belum dikonfirmasi,
              termasuk yang udah masuk batch & nunggu TF) SENGAJA gak dipakai
              di kartu ringkasan lagi (2026-09-02) — user sempat bingung liat
              "Pending: Rp75rb" padahal "Buat Pengajuan Baru" bilang "gak ada
              yang perlu diajukan", ternyata baris itu udah kepakai di batch
              lain (nunggu TF, bukan nunggu diajukan). Kartu di atas sekarang
              persis mencerminkan apa yang bakal disapu tombol "Buat Pengajuan
              Baru" di bawah, biar gak ada gap ekspektasi. Progress "nunggu TF"
              tetap kelihatan per-batch di kartu Riwayat Pengajuan (badge TF X/Y). */}

          {isSuperAdmin ? (
            <div className="mb-4">
              {!showForm ? (
                <div className="flex gap-2">
                  <button onClick={bukaForm}
                    className="flex-1 bg-[#1A4FA0] text-white text-sm font-bold px-4 py-3 rounded-full">
                    🗒️ Buat Pengajuan Baru
                  </button>
                  <button onClick={() => window.open('/admin/cetak-rekap-ujroh', '_blank')}
                    className="bg-gray-100 text-gray-600 text-sm font-bold px-4 py-3 rounded-full">
                    🖨️ Preview Live
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-bold text-[#0E2F6E] mb-2">Pilih periode pengajuan</div>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="date" value={periodeMulai} onChange={e => setPeriodeMulai(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                    <span className="text-xs text-gray-400">s/d</span>
                    <input type="date" value={periodeSelesai} onChange={e => setPeriodeSelesai(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  {periodeTerpakai.length > 0 && (
                    <div className="text-[10px] text-gray-400 mb-2">
                      Periode yang udah kepakai: {periodeTerpakai.map(p => `${fmtTanggal(p.periode_mulai)}–${fmtTanggal(p.periode_selesai)}`).join(', ')}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={buatPengajuan} disabled={creating}
                      className="flex-1 bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-full disabled:opacity-50">
                      {creating ? 'Membuat...' : 'Buat Pengajuan'}
                    </button>
                    <button onClick={() => setShowForm(false)} disabled={creating}
                      className="bg-gray-100 text-gray-500 text-xs font-bold px-4 py-2 rounded-full">
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400 mb-4">
              Bikin pengajuan &amp; cetak rekap cuma bisa dilakukan super_admin.
            </div>
          )}

          <div className="font-bold text-[#0E2F6E] mb-2 text-sm">Riwayat Pengajuan</div>
          {pengajuan.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Belum ada pengajuan.</div>
          ) : (
            <div className="space-y-2">
              {pengajuan.map(p => (
                <div key={p.id} onClick={() => router.push(`/admin/sahabat/pencairan/${p.id}`)}
                  className="bg-white rounded-xl border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-[#0E2F6E]">{namaPengajuan(p)}</div>
                      <div className="text-xs text-gray-400">#{p.id} · {p.jumlah_baris} baris</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#0E2F6E]">{fmtRp(p.grand_total)}</div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_WARNA[p.status] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[p.status] || p.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-400 mt-4">
            Konfirmasi TF eksekusi per-batch ada di halaman detail pengajuan masing-masing. Konfirmasi pemakaian saldo checkout mandiri (bukan bagian pengajuan mingguan) tetap di{' '}
            <a href="/admin/sahabat/database" className="text-[#1A4FA0] font-semibold hover:underline">Database Jamaah</a>.
          </div>
        </>
      )}
    </Layout>
  );
}
