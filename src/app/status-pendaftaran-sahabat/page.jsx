'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan } from '@/lib/usePengaturan';
import { renderPasalBlock, SignatureBlokBank, SignatureBlokKuasa, KopPasalDokumen, FONT_DOKUMEN, UKURAN_DOKUMEN } from '@/lib/pasalMarkup';
import UploadScanDokumen from '@/app/components/UploadScanDokumen';

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
  const [cifInput, setCifInput] = useState('');
  const [savingCif, setSavingCif] = useState(false);
  const [tanggalMulaiInput, setTanggalMulaiInput] = useState('');
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

  function muat() {
    fetch('/api/status-pendaftaran-sahabat').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
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

  async function simpanCif() {
    if (!cifInput.trim()) { alert('Isi nomor CIF BSI dulu'); return; }
    setSavingCif(true);
    try {
      const res = await fetch('/api/sahabat/cif-bsi', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cif_bsi: cifInput.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingCif(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingCif(false);
  }

  async function simpanDataBlokir() {
    if (!tanggalMulaiInput.trim()) {
      alert('Isi tanggal mulai blokir dulu'); return;
    }
    setSavingBlokirData(true);
    try {
      const res = await fetch('/api/sahabat/blokir-rekening', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tanggal_mulai: tanggalMulaiInput }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingBlokirData(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingBlokirData(false);
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

  function cekScrollGabungan(e) {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setSudahBacaGabungan(true);
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

  const cifDanBlokirLengkap = prasyarat.cif_bsi_terisi && prasyarat.blokir_data_terisi;

  return (
    <Layout title="🤝 Status Pendaftaran Sahabat Baitullah" showBack>
      <div className="max-w-xl mx-auto space-y-3">
        <div className="bg-[#E8F0FB] rounded-xl p-3 text-xs text-[#1A4FA0]">
          Program Sahabat Baitullah — ikuti langkah di bawah sampai selesai untuk jadi Jamaah Sahabat Baitullah aktif.
        </div>

        {/* Rekening Tabungan Umroh ditampilkan PALING AWAL — kronologisnya
            memang paling duluan (diisi di wizard /daftar-sahabat step 4,
            sebelum bukti TF/SPK-AK sama sekali), jadi biasanya udah ✅ dari
            awal begitu halaman ini kebuka pertama kali. Dulu taruh di
            tengah bikin urutan checklist keliatan "loncat" (item selesai
            nyempil di antara item pending) — dikonfirmasi user 2026-09-20. */}
        <Item done={prasyarat.rekening_umroh_terisi} label="Rekening Tabungan Umroh">
          {prasyarat.rekening_umroh_terisi ? (
            <div className="text-xs text-gray-500">{u.no_rekening_tabungan_umroh}</div>
          ) : (
            <div className="space-y-2">
              {(pengaturan?.panduan_buka_rekening_bsi_path || pengaturan?.panduan_buka_tabungan_umroh_path) && (
                <div className="flex gap-2">
                  {pengaturan?.panduan_buka_rekening_bsi_path && (
                    <a href={pengaturan.panduan_buka_rekening_bsi_path} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold text-[#1A4FA0] underline">📘 Panduan Buka Rekening BSI</a>
                  )}
                  {pengaturan?.panduan_buka_tabungan_umroh_path && (
                    <a href={pengaturan.panduan_buka_tabungan_umroh_path} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold text-[#1A4FA0] underline">📘 Panduan Buka Tabungan Umroh</a>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <input value={rekUmrohInput} onChange={e => setRekUmrohInput(e.target.value)} placeholder="Nomor rekening tabungan umroh"
                  className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                <button onClick={() => simpanRekening('no_rekening_tabungan_umroh', rekUmrohInput, setSavingRekUmroh)} disabled={savingRekUmroh}
                  className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
                  {savingRekUmroh ? '...' : 'Simpan'}
                </button>
              </div>
            </div>
          )}
        </Item>

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

        <Item done={prasyarat.spk_ak_selesai} label="SPK-AK — Surat Perjanjian Jamaah Sahabat Baitullah">
          {!prasyarat.bukti_tf_verified && <div className="text-xs text-gray-400">Menunggu verifikasi bukti transfer dulu.</div>}
          {prasyarat.bukti_tf_verified && !prasyarat.spk_ak_selesai && (
            <button onClick={() => router.push('/pks?jenis=sahabat_baitullah')} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">
              Lanjut TTD Digital →
            </button>
          )}
          {prasyarat.spk_ak_selesai && <div className="text-xs text-gray-500">Sudah ditandatangani secara digital.</div>}
        </Item>

        {/* Gate SPK-AK ditambahin di sini (dikonfirmasi user 2026-09-20) —
            dulu step ini cuma nunggu bukti_tf_verified, jadi CIF & data
            blokir bisa diisi SEBELUM SPK-AK ditandatangani walau nominal
            blokirnya sendiri emang udah gak gantung ke SPK-AK (diambil dari
            Target Impian). Tetap dikunci urut biar alurnya linear & gak
            "loncat", konsisten sama gate spk_ak_selesai yang emang udah
            wajib buat bisa advance ke 'active' (lihat
            /api/status-pendaftaran-sahabat action=advance). */}
        <Item done={prasyarat.setuju_sk_cif_pemblokiran} label="Baca & Setuju — Surat Kuasa CIF & Blokir Rekening">
          {!prasyarat.bukti_tf_verified && <div className="text-xs text-gray-400">Menunggu verifikasi bukti transfer dulu.</div>}
          {prasyarat.bukti_tf_verified && !prasyarat.spk_ak_selesai && <div className="text-xs text-gray-400">Selesaikan tanda tangan digital SPK-AK dulu.</div>}

          {prasyarat.bukti_tf_verified && prasyarat.spk_ak_selesai && !prasyarat.setuju_sk_cif_pemblokiran && !cifDanBlokirLengkap && (
            <div className="space-y-3">
              {!prasyarat.cif_bsi_terisi ? (
                <div className="flex gap-2">
                  <input value={cifInput} onChange={e => setCifInput(e.target.value)} placeholder="Nomor CIF BSI"
                    className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                  <button onClick={simpanCif} disabled={savingCif}
                    className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
                    {savingCif ? '...' : 'Simpan'}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-gray-500">No. CIF BSI: <b>{u.cif_bsi}</b></div>
              )}

              {!prasyarat.blokir_data_terisi && (
                <div className="space-y-2">
                  {/* Nominal & jangka waktu bukan input bebas lagi
                      (dikonfirmasi user 2026-09-20) — nominal ngikutin
                      Target Impian yang udah dikunci di wizard daftar-sahabat,
                      jangka waktu fix 90 hari sesuai perjanjian SPK-AK.
                      Jamaah cuma pilih tanggal mulai blokirnya. */}
                  <div className="text-xs text-gray-400">Data blokir rekening tabungan umroh Anda (otomatis, sesuai perjanjian):</div>
                  <div className="bg-gray-50 border-2 border-gray-100 rounded-lg p-2.5 text-xs text-gray-600 space-y-1">
                    <div>No. Rekening: <b>{u.no_rekening_tabungan_umroh || '-'}</b></div>
                    <div>Nominal blokir: <b>Rp {Number(pendaftaran?.target_estimasi_harga || 0).toLocaleString('id-ID')}</b></div>
                    <div>Jangka waktu: <b>90 hari</b></div>
                  </div>
                  <label className="block text-xs font-semibold text-gray-500">Tanggal Mulai Blokir</label>
                  <input value={tanggalMulaiInput} onChange={e => setTanggalMulaiInput(e.target.value)} type="date"
                    className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                  <button onClick={simpanDataBlokir} disabled={savingBlokirData}
                    className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                    {savingBlokirData ? 'Menyimpan...' : 'Simpan Data Blokir'}
                  </button>
                </div>
              )}
            </div>
          )}

          {prasyarat.bukti_tf_verified && prasyarat.spk_ak_selesai && !prasyarat.setuju_sk_cif_pemblokiran && cifDanBlokirLengkap && (
            <div className="space-y-2">
              {!skCif || !suratPemblokiran ? (
                <button onClick={bukaPreviewGabungan} disabled={loadingPreview}
                  className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full disabled:opacity-50">
                  {loadingPreview ? 'Memuat...' : 'Baca SK-CIF & Surat Kuasa Blokir Rekening →'}
                </button>
              ) : (
                <>
                  <div onScroll={cekScrollGabungan}
                    className="max-h-[350px] overflow-y-auto border border-gray-200 rounded-lg p-3 text-gray-600 space-y-4"
                    style={{ fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal }}>
                    <div>
                      <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT KUASA KERJASAMA MULTI CIF</div>
                      <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {skCif.nomor}</div>
                      {(skCif.pasal || []).map(p => (<div key={`skcif-${p.nomor}`}>{renderPasalBlock(p, skCif.mergeData)}</div>))}
                    </div>
                    <div className="pt-4 border-t border-gray-100">
                      <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT PERNYATAAN KUASA BLOKIR REKENING & INSTRUKSI PEMINDAHBUKUAN</div>
                      <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {suratPemblokiran.nomor}</div>
                      {(suratPemblokiran.pasal || []).map(p => (<div key={`pemblokiran-${p.nomor}`}>{renderPasalBlock(p, suratPemblokiran.mergeData)}</div>))}
                    </div>
                  </div>
                  {!sudahBacaGabungan && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-center text-xs text-yellow-700">
                      ⬇️ Gulir ke bawah sampai selesai membaca kedua surat
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

        {prasyarat.setuju_sk_cif_pemblokiran && (
          <Item done={prasyarat.sk_cif_selesai && prasyarat.surat_pemblokiran_selesai} label="Cetak & Unggah Scan (SK-CIF + Surat Pemblokiran)">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700 mb-2">
              Boleh dilewati dulu — tapi segera cetak, tanda tangani di atas materai asli, lalu kirim fisiknya ke kantor JM Travel Jakarta.
            </div>
            <div className="no-print text-right mb-2">
              <button onClick={() => window.print()} className="text-[#1A4FA0] font-bold text-sm">🖨️ Print Kedua Surat</button>
            </div>
            {skCif && (
              <div className="sheet bg-white border border-gray-200 rounded-lg p-3 text-gray-600 space-y-2 mb-3" style={{ fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal }}>
                <KopPasalDokumen pengaturan={pengaturan} />
                <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT KUASA</div>
                <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>KERJASAMA MULTI CIF</div>
                <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>PADA LAYANAN BSI CASH MANAGEMENT</div>
                <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {skCif.nomor}</div>
                {(skCif.pasal || []).map(p => (<div key={p.nomor}>{renderPasalBlock(p, skCif.mergeData)}</div>))}
                <SignatureBlokKuasa namaPemberi={u.name} namaPenerima={skCif.mergeData?.nama_wakil} jabatanPenerima={skCif.mergeData?.jabatan_wakil} />
                <div className="no-print">
                  <UploadScanDokumen label={`Scan SK-CIF (materai + TTD) ${u.dokumen_sk_cif_fisik_path ? '— ✅ terkirim' : '— ⏳ belum dikirim'}`}
                    uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
                    userId={user.id} path={u.dokumen_sk_cif_fisik_path} uploadedAt={null}
                    extraFields={{ jenis: 'sk_cif' }} onUploaded={() => muat()} />
                </div>
              </div>
            )}
            {suratPemblokiran && (
              <div className="sheet bg-white border border-gray-200 rounded-lg p-3 text-gray-600 space-y-2" style={{ fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal }}>
                <div className="no-print text-right">
                  <button onClick={() => window.print()} className="text-[#1A4FA0] font-bold">🖨️ Print Surat Pemblokiran</button>
                </div>
                <KopPasalDokumen pengaturan={pengaturan} />
                <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT PERNYATAAN</div>
                <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>KUASA BLOKIR REKENING & INSTRUKSI PEMINDAHBUKUAN</div>
                <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {suratPemblokiran.nomor}</div>
                {(suratPemblokiran.pasal || []).map(p => (<div key={p.nomor}>{renderPasalBlock(p, suratPemblokiran.mergeData)}</div>))}
                <SignatureBlokBank namaPemberi={u.name} />
                <div className="no-print">
                  <UploadScanDokumen label={`Scan Surat Pemblokiran (materai + TTD) ${u.dokumen_surat_pemblokiran_fisik_path ? '— ✅ terkirim' : '— ⏳ belum dikirim'}`}
                    uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
                    userId={user.id} path={u.dokumen_surat_pemblokiran_fisik_path} uploadedAt={null}
                    extraFields={{ jenis: 'surat_pemblokiran' }} onUploaded={() => muat()} />
                </div>
              </div>
            )}
          </Item>
        )}

        {prasyarat.setuju_sk_cif_pemblokiran && pendaftaran.status !== 'active' && (
          <Item done={false} label="Menunggu ACC Admin">
            <div className="text-xs text-gray-400">Data Anda lagi direview admin. Gak perlu aksi apa-apa lagi di sini — kirim fisik SK-CIF & Surat Pemblokiran yang sudah TTD+materai ke kantor kalau belum, itu boleh menyusul.</div>
          </Item>
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

      {/* Halaman ini gabungan checklist + surat cetak SK-CIF/Surat Pemblokiran
          (bukan halaman cetak berdiri sendiri kayak cetak-perjanjian dkk) —
          tanpa isolasi ini, window.print() bakal nyetak SELURUH halaman
          (nav, semua kartu checklist lain), bukan cuma suratnya. Sembunyikan
          semuanya KECUALI .sheet yang lagi kebuka, paksa ukuran kertas A4
          (dikonfirmasi user 2026-09-09 — semua halaman cetak harus A4). */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .sheet, .sheet * { visibility: visible; }
          .sheet { position: relative; left: 0; width: 100%; box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 0 !important; page-break-after: always; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </Layout>
  );
}
