'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import PdfDokumenResmi from '@/app/components/PdfDokumenResmi';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';

// Field upload scan dokumen fisik — dipisah dari UploadScanDokumen (komponen
// bersama, dipakai halaman lain juga) biar gaya tampilannya bisa beda
// khusus di sini (dikonfirmasi tim desain 2026-09-29: field polos + nama
// file, BUKAN lagi badge yang nyelip di antara 2 halaman cetak surat).
function FieldUploadScan({ label, uploadUrl, userId, path: filePath, extraFields, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  async function pilihFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('user_id', userId);
      Object.entries(extraFields || {}).forEach(([k, v]) => fd.append(k, v));
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) onUploaded(d.path);
      else alert(d.error || 'Gagal mengunggah dokumen');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploading(false);
  }
  const namaFile = filePath ? decodeURIComponent(filePath.split('/').pop()) : null;
  return (
    <div className="flex items-center gap-2 border-2 border-gray-100 rounded-lg p-2.5">
      <div className="flex-1 min-w-0 text-xs">
        <div className="font-semibold text-gray-600">{label}</div>
        {namaFile ? (
          <a href={filePath} target="_blank" rel="noopener noreferrer" className="text-[#1A4FA0] truncate block">{namaFile}</a>
        ) : (
          <span className="text-gray-400">Belum ada file diunggah</span>
        )}
      </div>
      <label className="shrink-0 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">
        {uploading ? 'Mengunggah...' : namaFile ? 'Ganti' : 'Unggah'}
        <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploading}
          onChange={e => pilihFile(e.target.files?.[0])} />
      </label>
    </div>
  );
}

function Item({ done, label, children }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-lg leading-none mt-0.5">{done ? '✅' : '⏳'}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold ${done ? 'text-green-700' : 'text-gray-600'}`}>{label}</div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

export default function StatusPendaftaranSahabatPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [pengaturan] = usePengaturan();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingBlokirData, setSavingBlokirData] = useState(false);
  const [uploadingTf, setUploadingTf] = useState(false);
  const [rekUmrohInput, setRekUmrohInput] = useState('');
  const [savingRekUmroh, setSavingRekUmroh] = useState(false);
  const [rekeningSahabat, setRekeningSahabat] = useState([]);

  // Preview gabungan SK-CIF + Surat Pemblokiran buat step "baca & setuju".
  const [skCif, setSkCif] = useState(null);
  const [suratPemblokiran, setSuratPemblokiran] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sudahBacaGabungan, setSudahBacaGabungan] = useState(false);
  const [setujuGabungan, setSetujuGabungan] = useState(false);
  const [submittingSetuju, setSubmittingSetuju] = useState(false);
  const [generatingPdfSkCif, setGeneratingPdfSkCif] = useState(false);

  // Metode TTD fisik SEMENTARA (SPK-AK/SK-CIF/Surat Pemblokiran, vendor
  // esign belum siap — dikonfirmasi user 2026-09-30). 'kantor' butuh tanggal
  // rencana kunjungan, 'kirim' langsung lanjut print-scan-unggah seperti biasa.
  const [tanggalKunjunganInput, setTanggalKunjunganInput] = useState('');
  const [savingMetodeTtd, setSavingMetodeTtd] = useState(false);

  // Sudah/belum punya rekening BSI (dikonfirmasi user 2026-09-30) — cuma
  // pilihan tampilan lokal, gak perlu disimpan ke server. Yang UDAH PUNYA
  // rekening BSI biasa cuma perlu panduan buka Tabungan Umroh (BSI Byond)
  // aja. Yang BELUM PUNYA cuma perlu panduan buka Rekening BSI (biasa) —
  // file itu SUDAH TERMASUK cara buka Tabungan Umroh-nya juga, jadi panduan
  // Tabungan Umroh terpisah gak perlu ditampilkan lagi buat kasus ini.
  const [sudahPunyaRekeningBsi, setSudahPunyaRekeningBsi] = useState(null);

  function muat() {
    fetch('/api/status-pendaftaran-sahabat').then(r => r.json()).then(d => {
      // Sinkronkan status TERKINI ke localStorage (sama seperti
      // status-pendaftaran/page.jsx) — /dashboard/sahabat nge-guard pakai
      // user.status dari localStorage, yang masih 'pending' sejak login.
      // Tanpa ini, habis di-ACC admin "Buka Dashboard" mantul balik ke sini.
      if (d.user) {
        try {
          const parsed = JSON.parse(localStorage.getItem('user') || 'null');
          if (parsed && parsed.id === d.user.id) {
            localStorage.setItem('user', JSON.stringify({ ...parsed, status: d.user.status, terverifikasi: d.user.terverifikasi }));
          }
        } catch {}
      }
      setData(d); setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'sahabat_baitullah') { router.push('/'); return; }
    muat();
    fetch('/api/metode-pembayaran?scope=sahabat_baitullah').then(r => r.json()).then(d => setRekeningSahabat(d.metode || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function pilihBuktiTf(file) {
    if (!file) return;
    setUploadingTf(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/sahabat/upload-bukti-tf', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) muat();
      else alert(d.error || 'Gagal mengunggah bukti transfer');
    } catch { alert('Terjadi kesalahan saat mengunggah'); }
    setUploadingTf(false);
  }

  async function simpanRekening(field, nilai, setSaving) {
    if (!nilai.trim()) { alert('Isi nomor rekening dulu'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/sahabat/rekening-bsi', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, no_rekening: nilai.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSaving(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function simpanDataBlokir() {
    setSavingBlokirData(true);
    try {
      const res = await fetch('/api/sahabat/blokir-rekening', { method: 'PATCH' });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingBlokirData(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingBlokirData(false);
  }

  async function pilihMetodeTtd(metode) {
    if (metode === 'kantor' && !tanggalKunjunganInput) { alert('Pilih tanggal rencana kunjungan dulu'); return; }
    setSavingMetodeTtd(true);
    try {
      const res = await fetch('/api/sahabat/metode-ttd', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metode, tanggal_kunjungan: metode === 'kantor' ? tanggalKunjunganInput : undefined }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingMetodeTtd(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingMetodeTtd(false);
  }

  // Buka preview pasal SK-CIF + Surat Pemblokiran SEKALIGUS (satu step baca
  // gabungan, dikonfirmasi user 2026-09-19) — masing-masing endpoint juga
  // yang mendaftarkan sesi dokumen_signature fisiknya & membekukan nomor
  // surat (sekali, idempotent), sama seperti sebelum direstruktur.
  async function bukaPreviewGabungan() {
    setLoadingPreview(true);
    try {
      await Promise.all([
        fetch('/api/admin/dokumen-signature', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dokumen: 'sk_cif', ref_id: user.id, metode: 'fisik' }),
        }).catch(() => {}),
        fetch('/api/admin/dokumen-signature', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dokumen: 'surat_pemblokiran', ref_id: user.id, metode: 'fisik' }),
        }).catch(() => {}),
      ]);
      const [resSkCif, resPemblokiran] = await Promise.all([
        fetch('/api/sahabat/sk-cif'),
        fetch('/api/sahabat/surat-pemblokiran'),
      ]);
      const [dSkCif, dPemblokiran] = await Promise.all([resSkCif.json(), resPemblokiran.json()]);
      if (!resSkCif.ok) { alert(dSkCif.error); setLoadingPreview(false); return; }
      if (!resPemblokiran.ok) { alert(dPemblokiran.error); setLoadingPreview(false); return; }
      setSkCif(dSkCif);
      setSuratPemblokiran(dPemblokiran);
    } catch { alert('Terjadi kesalahan'); }
    setLoadingPreview(false);
  }


  // "Sudah baca" = PDF resmi gabungan (template, dikonfirmasi user 2026-10-01)
  // selesai dimuat di bawah — teks pasal DB gak dipakai lagi buat dokumen ini.

  // PDF gabungan SK-CIF + Surat Pemblokiran dengan identitas terisi
  // otomatis (dikonfirmasi user 2026-09-28) — SATU file, samain kayak alur
  // fisiknya (dua surat ini emang dicetak bareng). TIDAK menggantikan
  // tombol Print di atas, cuma nawarin hasil cetak yang lebih rapi (nempel
  // di template PDF final, bukan lagi render HTML).
  async function unduhPdfSkCif() {
    setGeneratingPdfSkCif(true);
    try {
      const res = await fetch('/api/sahabat/dokumen-legal/pdf-otomatis', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Gagal membuat PDF');
        setGeneratingPdfSkCif(false);
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch { alert('Terjadi kesalahan'); }
    setGeneratingPdfSkCif(false);
  }

  async function submitSetujuGabungan() {
    if (!setujuGabungan) { alert('Centang persetujuan terlebih dahulu!'); return; }
    setSubmittingSetuju(true);
    try {
      const res = await fetch('/api/sahabat/setuju-sk-cif-pemblokiran', { method: 'PATCH' });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSubmittingSetuju(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSubmittingSetuju(false);
  }

  if (loading || !data) return <Layout title="🤝 Status Pendaftaran Sahabat Baitullah" showBack><div className="text-center text-gray-400 py-10">Memuat...</div></Layout>;

  const { prasyarat, pendaftaran, user: u } = data;

  if (!pendaftaran) {
    return <Layout title="🤝 Status Pendaftaran Sahabat Baitullah" showBack><div className="max-w-md mx-auto">
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center">
        <div className="text-3xl mb-2">📝</div>
        <h4 className="font-bold text-yellow-800 mb-1">Belum Mengisi Data Diri</h4>
        <button onClick={() => router.push('/daftar-sahabat')} className="mt-2 bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full">
          Isi Data Diri →
        </button>
      </div>
    </div></Layout>;
  }

  // No. CIF BSI DICABUT dari funnel (dikonfirmasi user 2026-09-27) — gak
  // perlu diisi jamaah lagi & gak ada di output SK-CIF juga, satu-satunya
  // syarat sisa buat lanjut baca SK-CIF cuma data blokir rekening.
  const cifDanBlokirLengkap = prasyarat.blokir_data_terisi;

  return (
    <Layout title="🤝 Status Pendaftaran Sahabat Baitullah" showBack>
      <div className="max-w-xl mx-auto space-y-3">
        <div className="no-print space-y-3">
        <div className="bg-[#E8F0FB] rounded-xl p-3 text-xs text-[#1A4FA0]">
          Program Sahabat Baitullah — ikuti langkah di bawah sampai selesai untuk jadi Jamaah Sahabat Baitullah aktif.
        </div>

        {/* Urutan FINAL (dikonfirmasi user 2026-09-27): Bukti TF -> SPK-AK ->
            Rekening Tabungan Umroh -> Data Blokir — TANPA gate admin di
            tengah lagi (dibalik dari urutan lama SPK-AK dulu baru TF).
            Alasannya: materai SPK-AK (nanti kalau provider Peruri beneran
            disambung, sekarang masih mock/gratis) cuma boleh kebakar buat
            orang yang udah beneran transfer Rp1jt, bukan buat siapa aja yang
            baru isi data terus ngilang. Dipaksa juga di server (lihat
            /api/admin/dokumen-signature), bukan cuma gate UI di sini. */}
        <Item done={prasyarat.bukti_tf_verified} label={prasyarat.bukti_tf_verified ? 'Bukti transfer terunggah' : 'Unggah bukti transfer Rp1.000.000'}>
          {!prasyarat.bukti_tf_uploaded && (
            <div className="space-y-2">
              {rekeningSahabat.length > 0 && (
                <div className="bg-[#E8F0FB] rounded-lg p-2 text-xs text-[#1A4FA0] space-y-1">
                  {rekeningSahabat.map(r => (
                    <div key={r.id}>
                      <span className="font-bold">{r.nama}</span>{r.nomor && <> — {r.nomor}</>}{r.atas_nama && <> a.n. {r.atas_nama}</>}
                    </div>
                  ))}
                </div>
              )}
              <label className={`block border-2 border-dashed rounded-lg p-3 text-center cursor-pointer text-xs ${uploadingTf ? 'border-gray-200 text-gray-400' : 'border-gray-300 text-gray-500 hover:border-[#1A4FA0]'}`}>
                {uploadingTf ? 'Mengunggah...' : '📄 Klik untuk unggah bukti transfer'}
                <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={uploadingTf}
                  onChange={e => pilihBuktiTf(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </Item>

        {/* spk_ak_disetujui (checkbox di /pks) — GERBANG funnel di sini,
            BUKAN spk_ak_selesai (materai+TTD beneran, baru diproses server
            pas admin klik "Aktifkan" di ujung, dikonfirmasi user 2026-09-28
            biar e-materai gak kebakar duluan). */}
        <Item done={prasyarat.spk_ak_disetujui} label="SPK-AK — Surat Perjanjian Jamaah Sahabat Baitullah">
          {!prasyarat.bukti_tf_verified && <div className="text-xs text-gray-400">Unggah bukti transfer dulu di atas.</div>}
          {prasyarat.bukti_tf_verified && !prasyarat.spk_ak_disetujui && (
            <button onClick={() => router.push('/pks?jenis=sahabat_baitullah')} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">
              Baca & Setujui SPK-AK →
            </button>
          )}
          {prasyarat.spk_ak_disetujui && (
            <div className="text-xs text-gray-500">
              Sudah disetujui.{!prasyarat.spk_ak_selesai && ' Tanda tangan fisiknya digabung dengan SK-CIF & Surat Pemblokiran di langkah selanjutnya.'}
            </div>
          )}
        </Item>

        <Item done={prasyarat.rekening_umroh_terisi} label="Rekening Tabungan Umroh">
          {!prasyarat.spk_ak_disetujui && <div className="text-xs text-gray-400">Setujui SPK-AK dulu.</div>}
          {prasyarat.spk_ak_disetujui && (
            prasyarat.rekening_umroh_terisi ? (
              <div className="text-xs text-gray-500">{u.no_rekening_tabungan_umroh}</div>
            ) : sudahPunyaRekeningBsi === null ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">Apakah Anda sudah punya rekening BSI (biasa)?</div>
                <div className="flex gap-2">
                  <button onClick={() => setSudahPunyaRekeningBsi(true)}
                    className="flex-1 text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-2 rounded-lg">
                    ✅ Sudah Punya
                  </button>
                  <button onClick={() => setSudahPunyaRekeningBsi(false)}
                    className="flex-1 text-xs font-bold text-gray-600 bg-gray-100 px-3 py-2 rounded-lg">
                    Belum Punya
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Sudah punya rekening BSI -> cuma perlu buka Tabungan Umroh
                    (BSI Byond). Belum punya -> panduan Buka Rekening BSI aja,
                    filenya udah termasuk cara buka Tabungan Umroh juga. */}
                {sudahPunyaRekeningBsi && pengaturan?.panduan_buka_tabungan_umroh_path && (
                  <a href={pengaturan.panduan_buka_tabungan_umroh_path} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-[#1A4FA0] underline block">📘 Panduan Buka Tabungan Umroh (BSI Byond)</a>
                )}
                {!sudahPunyaRekeningBsi && pengaturan?.panduan_buka_rekening_bsi_path && (
                  <a href={pengaturan.panduan_buka_rekening_bsi_path} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-[#1A4FA0] underline block">📘 Panduan Buka Rekening BSI (sudah termasuk Tabungan Umroh)</a>
                )}
                <div className="flex gap-2">
                  <input value={rekUmrohInput} maxLength={20} inputMode="numeric"
                    onChange={e => setRekUmrohInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nomor rekening tabungan umroh"
                    className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                  <button onClick={() => simpanRekening('no_rekening_tabungan_umroh', rekUmrohInput, setSavingRekUmroh)} disabled={savingRekUmroh}
                    className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
                    {savingRekUmroh ? '...' : 'Simpan'}
                  </button>
                </div>
                <button onClick={() => setSudahPunyaRekeningBsi(null)} className="text-[10px] text-gray-400 underline">← Ganti jawaban</button>
              </div>
            )
          )}
        </Item>

        {/* SEMENTARA (dikonfirmasi user 2026-09-30) — vendor esign/e-materai
            belum siap, jadi ketiga dokumen (SPK-AK, SK-CIF, Surat
            Pemblokiran) TTD-nya fisik semua. Jamaah pilih SATU kali: datang
            langsung ke kantor (bawa 2 materai buat SK-CIF+Pemblokiran,
            materai SPK-AK disediakan kantor), atau print-scan-kirim sendiri
            (pola existing buat SK-CIF/Pemblokiran; SPK-AK cetak lewat
            /api/sahabat/unduh-spk-ak — reuse template PDF yang SAMA persis
            dipakai jalur digital, BUKAN halaman /admin/cetak-spk-ak yang
            templatenya beda & gak dukung varian non-Muslim). */}
        <Item done={!!u.metode_ttd_sahabat} label="Metode Tanda Tangan Fisik (SPK-AK, SK-CIF & Surat Pemblokiran)">
          {!prasyarat.rekening_umroh_terisi && <div className="text-xs text-gray-400">Isi dulu Rekening Tabungan Umroh di atas.</div>}
          {prasyarat.rekening_umroh_terisi && !u.metode_ttd_sahabat && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Pilih cara Anda menandatangani ketiga dokumen di atas materai asli:</div>
              <button onClick={() => pilihMetodeTtd('kirim')} disabled={savingMetodeTtd}
                className="w-full text-left text-xs bg-[#E8F0FB] text-[#1A4FA0] font-bold px-3 py-2.5 rounded-lg disabled:opacity-50">
                📄 Cetak &amp; kirim sendiri — print, TTD di atas materai asli, scan, unggah, kirim fisik ke kantor
              </button>
              <div className="bg-gray-50 border-2 border-gray-100 rounded-lg p-2.5 space-y-2">
                <div className="text-xs font-bold text-[#1A4FA0]">🏢 Datang langsung ke Head Office</div>
                <div className="text-[10px] text-gray-500">TTD ketiga dokumen di tempat. Wajib bawa 2 materai (SK-CIF & Surat Pemblokiran) — materai SPK-AK sudah disediakan kantor.</div>
                <div className="flex gap-2">
                  <input type="date" value={tanggalKunjunganInput} onChange={e => setTanggalKunjunganInput(e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border-2 border-gray-200 text-xs focus:border-[#1A4FA0] focus:outline-none" />
                  <button onClick={() => pilihMetodeTtd('kantor')} disabled={savingMetodeTtd || !tanggalKunjunganInput}
                    className="bg-[#1A4FA0] text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 whitespace-nowrap">
                    {savingMetodeTtd ? '...' : 'Pilih Tanggal Ini'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {u.metode_ttd_sahabat === 'kantor' && (
            <div className="text-xs text-gray-500 space-y-1">
              <div>🏢 Anda akan datang ke kantor pada <b>{new Date(u.rencana_kunjungan_kantor_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b> untuk TTD ketiga dokumen langsung.</div>
              <div>Jangan lupa bawa 2 materai (SK-CIF &amp; Surat Pemblokiran) — materai SPK-AK sudah disediakan kantor.</div>
              <button onClick={() => { setTanggalKunjunganInput(''); pilihMetodeTtd('kirim'); }} disabled={savingMetodeTtd}
                className="text-[10px] text-gray-400 underline">Ganti jadi cetak &amp; kirim sendiri</button>
            </div>
          )}
          {u.metode_ttd_sahabat === 'kirim' && (
            <div className="text-xs text-gray-500">
              📄 Cetak &amp; kirim sendiri — lanjutkan cetak SPK-AK &amp; SK-CIF/Surat Pemblokiran di bawah, TTD di atas materai asli, scan, unggah, lalu kirim fisik ke kantor.
            </div>
          )}
        </Item>

        {prasyarat.rekening_umroh_terisi && u.metode_ttd_sahabat === 'kirim' && prasyarat.spk_ak_disetujui && (
          <Item done={prasyarat.spk_ak_selesai} label="Cetak & Unggah SPK-AK">
            <div className="text-xs text-gray-500 space-y-2">
              <div>Unduh &amp; cetak <b>2 rangkap</b>. Rangkap 1 (arsip Anda): tempel materai di kolom TTD Pihak Pertama (Manajemen). Rangkap 2 (dikirim ke kantor): tempel materai di kolom TTD Anda (Pihak Kedua). TTD Anda di KEDUA rangkap, lalu kirim keduanya ke kantor — nanti kami TTD sisi Manajemen &amp; kirim balik Rangkap 1 ke Anda.</div>
              <button onClick={() => window.open('/api/sahabat/unduh-spk-ak', '_blank')}
                className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">
                📄 Unduh Dokumen SPK-AK
              </button>
              <FieldUploadScan label="SPK-AK (2 rangkap, materai + TTD)"
                uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
                userId={user.id} path={u.dokumen_spk_ak_fisik_path}
                extraFields={{ jenis: 'spk_ak' }} onUploaded={() => muat()} />
              {prasyarat.spk_ak_selesai && !u.dokumen_spk_ak_dikirim_balik_at && (
                <div className="text-[10px] text-amber-600">⏳ Menunggu kantor kirim balik Rangkap 1 yang sudah di-TTD &amp; bermaterai.</div>
              )}
              {u.dokumen_spk_ak_dikirim_balik_at && (
                <div className="text-[10px] text-green-600">✅ Rangkap 1 sudah dikirim balik kantor pada {new Date(u.dokumen_spk_ak_dikirim_balik_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.</div>
              )}
            </div>
          </Item>
        )}

        <Item done={prasyarat.setuju_sk_cif_pemblokiran} label="Baca & Setuju — Surat Kuasa CIF & Blokir Rekening">
          {!prasyarat.rekening_umroh_terisi && <div className="text-xs text-gray-400">Isi dulu Rekening Tabungan Umroh di atas.</div>}

          {prasyarat.rekening_umroh_terisi && !prasyarat.setuju_sk_cif_pemblokiran && !cifDanBlokirLengkap && (
            <div className="space-y-3">
              {!prasyarat.blokir_data_terisi && (
                <div className="space-y-2">
                  {/* Nominal bukan input bebas lagi (dikonfirmasi user
                      2026-09-20) — ngikutin Target Impian yang udah dikunci
                      di wizard daftar-sahabat. Tanggal mulai blokir = hari
                      ini (tanggal persetujuan) — BUKAN date-picker bebas
                      lagi (dikonfirmasi user 2026-09-29: "tgl blokir ya
                      tanggal ttd aja gausah ribet", ini cuma dokumen
                      perjanjian bukan transaksi bank beneran). Jangka waktu
                      DULU fix 90 hari, sekarang dihitung otomatis dari hari
                      ini sampai tanggal keberangkatan program target
                      (dikonfirmasi user 2026-09-29 — program bisa dipilih
                      jauh sebelum keberangkatan, gak masuk akal kalau
                      blokirnya dipatok 90 hari doang gak peduli kapan
                      berangkatnya). TIDAK digate ke saldo tabungan aktual
                      (dikonfirmasi user 2026-09-29 — nominal di surat ini
                      emang cuma nominal target program). */}
                  <div className="text-xs text-gray-400">Data blokir rekening tabungan umroh Anda (otomatis, sesuai perjanjian):</div>
                  <div className="bg-gray-50 border-2 border-gray-100 rounded-lg p-2.5 text-xs text-gray-600 space-y-1">
                    <div>No. Rekening: <b>{u.no_rekening_tabungan_umroh || '-'}</b></div>
                    <div>Nominal blokir: <b>Rp {Number(pendaftaran?.target_estimasi_harga || 0).toLocaleString('id-ID')}</b></div>
                    <div>Tanggal mulai: <b>Hari ini, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
                    <div>
                      Jangka waktu: <b>
                        {pendaftaran?.tanggal_berangkat
                          ? `${Math.ceil((new Date(pendaftaran.tanggal_berangkat) - new Date()) / 86400000)} hari`
                          : '-'}
                      </b>
                      {pendaftaran?.tanggal_berangkat && (
                        <span className="text-gray-400"> (berangkat {new Date(pendaftaran.tanggal_berangkat).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})</span>
                      )}
                    </div>
                  </div>
                  {!(Number(pendaftaran?.target_estimasi_harga) > 0) ? (
                    // Target Rp 0 (program belum ada harga waktu daftar) —
                    // server pasti menolak, jadi arahkan ke admin saja.
                    <div className="text-xs text-red-500">
                      Target Impian Anda belum punya harga, jadi nominal blokir belum bisa dihitung. Hubungi admin JM Travel untuk memperbaiki target Anda.
                    </div>
                  ) : !pendaftaran?.tanggal_berangkat ? (
                    <div className="text-xs text-red-500">
                      Program target Anda belum punya tanggal keberangkatan, jadi jangka waktu blokir belum bisa dihitung. Hubungi admin JM Travel untuk memperbaiki jadwal program.
                    </div>
                  ) : (
                  <button onClick={simpanDataBlokir} disabled={savingBlokirData}
                    className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                    {savingBlokirData ? 'Menyimpan...' : 'Setuju & Simpan Data Blokir'}
                  </button>
                  )}
                </div>
              )}
            </div>
          )}

          {prasyarat.rekening_umroh_terisi && !prasyarat.setuju_sk_cif_pemblokiran && cifDanBlokirLengkap && (
            <div className="space-y-2">
              {!skCif || !suratPemblokiran ? (
                <button onClick={bukaPreviewGabungan} disabled={loadingPreview}
                  className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full disabled:opacity-50">
                  {loadingPreview ? 'Memuat...' : 'Baca SK-CIF & Surat Kuasa Blokir Rekening →'}
                </button>
              ) : (
                <>
                  {/* PDF resmi gabungan SK-CIF + Surat Pemblokiran (template final,
                      identitas terisi) — sama persis dengan yang dicetak &
                      ditandatangani (dikonfirmasi user 2026-10-01). */}
                  <PdfDokumenResmi url="/api/sahabat/dokumen-legal/pdf-otomatis" method="POST"
                    onSiap={() => setSudahBacaGabungan(true)} />
                  {!sudahBacaGabungan && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-center text-xs text-yellow-700">
                      ⏳ Memuat kedua surat…
                    </div>
                  )}
                  <label className={`flex items-start gap-2 p-3 rounded-lg border-2 ${sudahBacaGabungan ? 'bg-white border-gray-200 cursor-pointer' : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'}`}>
                    <input type="checkbox" checked={setujuGabungan} disabled={!sudahBacaGabungan}
                      onChange={e => setSetujuGabungan(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#1A4FA0] flex-shrink-0" />
                    <span className="text-xs text-gray-600">Saya sudah membaca dan setuju atas isi SK-CIF & Surat Pernyataan Kuasa Blokir Rekening di atas.</span>
                  </label>
                  <button onClick={submitSetujuGabungan} disabled={!setujuGabungan || submittingSetuju}
                    className="w-full bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-40">
                    {submittingSetuju ? 'Menyimpan...' : '✅ Setuju & Lanjutkan'}
                  </button>
                </>
              )}
            </div>
          )}

          {prasyarat.setuju_sk_cif_pemblokiran && (
            <div className="text-xs text-gray-500">Sudah dibaca & disetujui.</div>
          )}
        </Item>

        {prasyarat.setuju_sk_cif_pemblokiran && u.metode_ttd_sahabat !== 'kantor' && (
          <div className={`flex items-start gap-3 p-3 rounded-xl border ${prasyarat.sk_cif_selesai && prasyarat.surat_pemblokiran_selesai ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className="text-lg leading-none mt-0.5">{prasyarat.sk_cif_selesai && prasyarat.surat_pemblokiran_selesai ? '✅' : '⏳'}</div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-bold ${prasyarat.sk_cif_selesai && prasyarat.surat_pemblokiran_selesai ? 'text-green-700' : 'text-gray-600'}`}>Unduh & Unggah Scan (SK-CIF + Surat Pemblokiran)</div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-700 mt-2">
                <div className="font-bold mb-1">Langkah ini dapat dilewati sementara, namun wajib diselesaikan:</div>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Unduh dokumen di bawah ini, lalu cetak.</li>
                  <li>Tanda tangani di atas materai asli.</li>
                  <li>Pindai (scan) hasilnya, lalu unggah pada bagian paling bawah halaman ini.</li>
                  <li>Kirim dokumen fisik asli yang sudah ditandatangani tersebut ke kantor JM Travel melalui pos/kurir{pengaturan?.alamat_kantor ? ` (${pengaturan.alamat_kantor})` : ''}.</li>
                </ol>
              </div>
              <div className="mt-2 flex justify-between items-center flex-wrap gap-2">
                <a href={waLink(pengaturan?.wa_kantor, 'Assalamu\'alaikum JM Travel, saya membutuhkan bantuan terkait SK-CIF & Surat Pemblokiran.') || '#'}
                  target="_blank" rel="noopener noreferrer" className="text-green-600 font-bold text-xs">
                  Hubungi Admin via WhatsApp
                </a>
                <button onClick={unduhPdfSkCif} disabled={generatingPdfSkCif}
                  className="text-[#1A4FA0] font-bold text-sm disabled:opacity-50">
                  {generatingPdfSkCif ? 'Membuat Dokumen...' : '📄 Unduh Dokumen'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Lembar cetak HTML SK-CIF & Surat Pemblokiran (dulu dirender dari
            pasal DB) DIHAPUS (dikonfirmasi user 2026-10-01) — cetak lewat
            tombol "📄 Unduh Dokumen" di atas yang pakai template PDF resmi. */}
        {/* Unggah scan dipisah dari .sheet di atas (dikonfirmasi tim desain
            2026-09-29) — sebelumnya nyelip di antara 2 halaman cetak surat,
            keliatan kayak bagian dari surat itu sendiri padahal cuma UI
            upload. Sekarang dikonsolidasi jadi 1 kartu terpisah, style field
            polos + nama file (bukan lagi badge status). */}
        {prasyarat.setuju_sk_cif_pemblokiran && u.metode_ttd_sahabat !== 'kantor' && (
          <div className="no-print bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div>
              <div className="font-bold text-[#0E2F6E] text-sm">📤 Unggah Scan Dokumen</div>
              <div className="text-xs text-gray-400 mt-0.5">Unggah hasil pindai (scan) SK-CIF & Surat Pemblokiran yang sudah ditandatangani di atas materai asli.</div>
            </div>
            <FieldUploadScan label="SK-CIF (materai + TTD)"
              uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
              userId={user.id} path={u.dokumen_sk_cif_fisik_path}
              extraFields={{ jenis: 'sk_cif' }} onUploaded={() => muat()} />
            <FieldUploadScan label="Surat Pemblokiran (materai + TTD)"
              uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
              userId={user.id} path={u.dokumen_surat_pemblokiran_fisik_path}
              extraFields={{ jenis: 'surat_pemblokiran' }} onUploaded={() => muat()} />
          </div>
        )}

        <div className="no-print space-y-3">
        {/* Style beda sengaja dari Item abu-abu "belum selesai" di atas
            (dikonfirmasi tim desain 2026-09-29) — status INI justru bagus
            (semua langkah udah kelar dari sisi jamaah), jadi tampilannya
            dibikin reassuring/hangat, bukan kesan "kaku nunggu doang".
            Judul & isi DIBEDAKAN tergantung status unggah scan (bug nyata
            dari laporan user 2026-09-29 — sebelumnya selalu bilang "Seluruh
            Persyaratan Telah Lengkap" padahal scan-nya sendiri belum
            diunggah sama sekali, kontradiktif sama field upload di
            atasnya). Unggah scan tetap boleh menyusul (lihat catatan
            "dapat dilewati sementara"), tapi wordingnya harus jujur soal
            status sebenarnya. */}
        {prasyarat.setuju_sk_cif_pemblokiran && pendaftaran.status !== 'active' && (
          <div className="bg-[#E8F0FB] border border-[#c9d9f0] rounded-xl p-4 text-center">
            <div className="text-3xl mb-1">🙌</div>
            {prasyarat.sk_cif_selesai && prasyarat.surat_pemblokiran_selesai ? (
              <>
                <div className="font-bold text-[#0E2F6E]">Seluruh Persyaratan Telah Lengkap</div>
                <div className="text-xs text-[#1A4FA0] mt-1.5 leading-relaxed">
                  Data Anda sedang ditinjau oleh admin dan akun akan segera diaktifkan.
                  Pastikan dokumen fisik asli (SK-CIF & Surat Pemblokiran) yang sudah ditandatangani di atas materai asli juga telah dikirim ke kantor JM Travel.
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-[#0E2F6E]">Persyaratan Utama Telah Lengkap</div>
                <div className="text-xs text-[#1A4FA0] mt-1.5 leading-relaxed">
                  Data Anda sudah dapat ditinjau oleh admin. Agar proses aktivasi akun dapat diselesaikan, mohon segera unggah hasil pindai (scan) SK-CIF & Surat Pemblokiran pada bagian di atas, lalu kirim dokumen fisik aslinya ke kantor JM Travel.
                </div>
              </>
            )}
          </div>
        )}

        {pendaftaran.status === 'active' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🎉</div>
            <div className="font-bold text-green-700">Anda sudah jadi Jamaah Sahabat Baitullah aktif!</div>
            <div className="text-xs text-green-600 mt-1">Voucher Rp1.000.000, Program Eksklusif, dan Materi Presentasi sudah kebuka.</div>
            <button onClick={() => router.push('/dashboard/sahabat')} className="mt-2 bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full">
              Buka Dashboard →
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Halaman ini gabungan checklist + surat cetak SK-CIF/Surat Pemblokiran
          (bukan halaman cetak berdiri sendiri kayak cetak-perjanjian dkk) —
          tanpa isolasi ini, window.print() bakal nyetak SELURUH halaman
          (nav, semua kartu checklist lain), bukan cuma suratnya.

          BUG ditemukan & diperbaiki (2026-09-20, laporan user "kok kena 3-4
          halaman"): dulu pola-nya "body * {visibility:hidden}" + ".sheet
          {visibility:visible}" — visibility:hidden TETAP nyisain ruang
          layout (beda dari display:none), jadi kartu-kartu checklist yang
          "disembunyikan" di atas .sheet tetap makan ruang kosong pas print,
          dorong isi surat turun & meluber ke halaman ekstra. Sekarang
          checklist yang gak perlu dicetak dibungkus .no-print (display:none,
          BENERAN ilang dari layout) langsung di JSX-nya (lihat di atas),
          .sheet gak lagi nyandar ke trik visibility apa pun.

          page-break-after: always CUMA di sheet SK-CIF (biar Surat
          Pemblokiran mulai halaman baru) — sheet TERAKHIR (Surat
          Pemblokiran) SENGAJA gak dikasih forced break lagi (dulu semua
          .sheet kena, bikin ada halaman kosong nyempil di ujung). Paksa
          ukuran kertas A4 (dikonfirmasi user 2026-09-09 — semua halaman
          cetak harus A4). */}
      <style>{`
        @media print {
          .sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 0 !important; }
          .sheet-break { page-break-after: always; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </Layout>
  );
}
