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
  const [skCif, setSkCif] = useState(null);
  const [loadingSkCif, setLoadingSkCif] = useState(false);
  const [nominalBlokirInput, setNominalBlokirInput] = useState('');
  const [jangkaWaktuInput, setJangkaWaktuInput] = useState('');
  const [tanggalMulaiInput, setTanggalMulaiInput] = useState('');
  const [savingBlokirData, setSavingBlokirData] = useState(false);
  const [suratPemblokiran, setSuratPemblokiran] = useState(null);
  const [loadingSuratPemblokiran, setLoadingSuratPemblokiran] = useState(false);
  const [uploadingTf, setUploadingTf] = useState(false);
  const [rekUmrohInput, setRekUmrohInput] = useState('');
  const [savingRekUmroh, setSavingRekUmroh] = useState(false);
  const [showByondHelp, setShowByondHelp] = useState(false);
  const [rekeningSahabat, setRekeningSahabat] = useState([]);

  function muat() {
    fetch('/api/status-pendaftaran-sahabat').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'sahabat_baitullah') { router.push('/'); return; }
    muat();
    fetch('/api/metode-pembayaran?scope=sahabat').then(r => r.json()).then(d => setRekeningSahabat(d.metode || [])).catch(() => {});
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

  async function bukaSkCif() {
    setLoadingSkCif(true);
    try {
      // Catat sesi dokumen_signature (fisik, selalu) sekali di sini —
      // supaya SK-CIF tercatat di sistem penandaan dokumen walau jalurnya
      // selalu fisik (tidak pernah masuk pipeline TTD digital).
      await fetch('/api/admin/dokumen-signature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen: 'sk_cif', ref_id: user.id, metode: 'fisik' }),
      }).catch(() => {});
      const res = await fetch('/api/sahabat/sk-cif');
      const d = await res.json();
      if (!res.ok) { alert(d.error); setLoadingSkCif(false); return; }
      setSkCif(d);
    } catch { alert('Terjadi kesalahan'); }
    setLoadingSkCif(false);
  }

  async function simpanDataBlokir() {
    if (!nominalBlokirInput.trim() || !jangkaWaktuInput.trim() || !tanggalMulaiInput.trim()) {
      alert('Isi nominal, jangka waktu, dan tanggal mulai blokir dulu'); return;
    }
    setSavingBlokirData(true);
    try {
      const res = await fetch('/api/sahabat/blokir-rekening', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nominal_blokir: nominalBlokirInput.trim(), jangka_waktu_hari: jangkaWaktuInput.trim(), tanggal_mulai: tanggalMulaiInput }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingBlokirData(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingBlokirData(false);
  }

  async function bukaSuratPemblokiran() {
    setLoadingSuratPemblokiran(true);
    try {
      // Sesi dokumen_signature (fisik, selalu) — pola sama persis SK-CIF.
      await fetch('/api/admin/dokumen-signature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen: 'surat_pemblokiran', ref_id: user.id, metode: 'fisik' }),
      }).catch(() => {});
      const res = await fetch('/api/sahabat/surat-pemblokiran');
      const d = await res.json();
      if (!res.ok) { alert(d.error); setLoadingSuratPemblokiran(false); return; }
      setSuratPemblokiran(d);
    } catch { alert('Terjadi kesalahan'); }
    setLoadingSuratPemblokiran(false);
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

  return (
    <Layout title="🤝 Status Pendaftaran Sahabat Baitullah" showBack>
      <div className="max-w-xl mx-auto space-y-3">
        <div className="bg-[#E8F0FB] rounded-xl p-3 text-xs text-[#1A4FA0]">
          Program Sahabat Baitullah — ikuti langkah di bawah sampai selesai untuk jadi Jamaah Sahabat Baitullah aktif.
        </div>

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

        <Item done={prasyarat.spk_ak_selesai} label="SPK-AK — Persetujuan Penggunaan Dana">
          {!prasyarat.bukti_tf_verified && <div className="text-xs text-gray-400">Menunggu verifikasi bukti transfer dulu.</div>}
          {!prasyarat.spk_ak_selesai && prasyarat.bukti_tf_verified && !u.setuju_pks && (
            <button onClick={() => router.push('/pks?jenis=sahabat')} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">
              Baca & Setujui SPK-AK →
            </button>
          )}
          {!prasyarat.spk_ak_selesai && u.setuju_pks && (
            <div className="space-y-2">
              <button onClick={() => router.push('/pks?jenis=sahabat')} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">
                Lanjut TTD Digital →
              </button>
              <div className="text-xs text-gray-400">Atau kalau memilih jalur fisik: cetak 2 rangkap, TTD + materai silang, lalu unggah scan-nya:</div>
              <button onClick={() => router.push(`/admin/cetak-spk-ak/${user.id}`)} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full">
                🖨️ Cetak SPK-AK (2 Rangkap) →
              </button>
              <UploadScanDokumen label="Scan SPK-AK (materai + TTD)" uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
                userId={user.id} path={u.dokumen_spk_ak_fisik_path} uploadedAt={null}
                extraFields={{ jenis: 'spk_ak' }} onUploaded={() => muat()} />
            </div>
          )}
        </Item>

        {/* Aturan (dikonfirmasi user 2026-09-03, ditegaskan ulang 2026-09-11
            — sempat mau ditambah rekening Wadiah buat refund Rp100rb tapi
            dibatalkan, ada revisi terpisah dari team soal ini): Sahabat
            Baitullah cuma punya SATU rekening — Rekening Tabungan Umroh BSI
            Byond. Gak ada "Rekening BSI Biasa" terpisah, jadi panduan Byond
            & Item di bawah cuma nge-gate ke tabungan_haji_status doang. */}
        {!prasyarat.tabungan_haji_status && (
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <button onClick={() => setShowByondHelp(v => !v)} className="text-xs font-bold text-[#1A4FA0] flex items-center gap-1">
              📱 Belum punya rekening tabungan umroh? Panduan buka lewat Byond {showByondHelp ? '▲' : '▼'}
            </button>
            {showByondHelp && (
              <div className="mt-2 text-xs text-gray-500 space-y-2">
                <div>Download aplikasi Byond by BSI, lalu buka rekening tabungan umroh di dalamnya.</div>
                <div className="flex gap-2">
                  <a href="https://play.google.com/store/search?q=BYOND%20by%20BSI&c=apps" target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg">🤖 Android</a>
                  <a href="https://apps.apple.com/id/search?term=BYOND%20by%20BSI" target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2 rounded-lg">🍎 iOS</a>
                </div>
                <div className="text-gray-400">Sudah punya rekening tabungan umroh dari sebelumnya? Gak perlu daftar ulang, cukup isi nomor rekeningnya di bawah.</div>
              </div>
            )}
          </div>
        )}

        <Item done={prasyarat.tabungan_haji_status} label="Rekening Tabungan Umroh">
          {prasyarat.tabungan_haji_status ? (
            <div className="text-xs text-gray-500">{u.no_rekening_tabungan_umroh}</div>
          ) : (
            <div className="flex gap-2">
              <input value={rekUmrohInput} onChange={e => setRekUmrohInput(e.target.value)} placeholder="Nomor rekening tabungan umroh"
                className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
              <button onClick={() => simpanRekening('no_rekening_tabungan_umroh', rekUmrohInput, setSavingRekUmroh)} disabled={savingRekUmroh}
                className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
                {savingRekUmroh ? '...' : 'Simpan'}
              </button>
            </div>
          )}
        </Item>

        <Item done={prasyarat.cif_bsi_terisi} label="Nomor CIF BSI">
          {!prasyarat.cif_bsi_terisi ? (
            pendaftaran.status === 'menunggu_sk_cif' || pendaftaran.status === 'active' ? (
              <div className="flex gap-2">
                <input value={cifInput} onChange={e => setCifInput(e.target.value)} placeholder="Nomor CIF BSI"
                  className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                <button onClick={simpanCif} disabled={savingCif}
                  className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50">
                  {savingCif ? '...' : 'Simpan'}
                </button>
              </div>
            ) : <div className="text-xs text-gray-400">Muncul setelah akun BSI & tabungan haji dicentang admin.</div>
          ) : <div className="text-xs text-gray-500">{u.cif_bsi}</div>}
        </Item>

        <Item done={prasyarat.sk_cif_selesai} label="SK-CIF (wajib fisik + materai)">
          {prasyarat.cif_bsi_terisi && !prasyarat.sk_cif_selesai && (
            <div className="space-y-2">
              {!skCif ? (
                <button onClick={bukaSkCif} disabled={loadingSkCif}
                  className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full disabled:opacity-50">
                  {loadingSkCif ? 'Memuat...' : 'Buka & Cetak SK-CIF →'}
                </button>
              ) : (
                <div className="sheet bg-white border border-gray-200 rounded-lg p-3 text-gray-600 space-y-2" style={{ fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal }}>
                  <div className="no-print text-right">
                    <button onClick={() => window.print()} className="text-[#1A4FA0] font-bold">🖨️ Print</button>
                  </div>
                  <KopPasalDokumen pengaturan={pengaturan} />
                  <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT KUASA</div>
                  <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>KERJASAMA MULTI CIF</div>
                  <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>PADA LAYANAN BSI CASH MANAGEMENT</div>
                  <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {skCif.nomor}</div>
                  {(skCif.pasal || []).map(p => (
                    <div key={p.nomor}>{renderPasalBlock(p, skCif.mergeData)}</div>
                  ))}
                  <SignatureBlokKuasa namaPemberi={u.name} namaPenerima={skCif.mergeData?.nama_wakil} jabatanPenerima={skCif.mergeData?.jabatan_wakil} />
                  <div className="no-print bg-red-50 text-red-600 rounded p-2">
                    Cetak, tanda tangani di atas materai asli, pindai halaman ini, lalu unggah di bawah — baru kirim salinan fisik ke kantor JM Travel Jakarta.
                  </div>
                  <div className="no-print">
                    <UploadScanDokumen label="Scan SK-CIF (materai + TTD)" uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
                      userId={user.id} path={u.dokumen_sk_cif_fisik_path} uploadedAt={null}
                      extraFields={{ jenis: 'sk_cif' }} onUploaded={() => muat()} />
                  </div>
                </div>
              )}
            </div>
          )}
        </Item>

        <Item done={prasyarat.surat_pemblokiran_selesai} label="Surat Pernyataan Kuasa Blokir Rekening (wajib fisik + materai)">
          {prasyarat.sk_cif_selesai && !prasyarat.surat_pemblokiran_selesai && !prasyarat.blokir_data_terisi && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400">Isi dulu data blokir rekening tabungan umroh Anda:</div>
              <input value={nominalBlokirInput} onChange={e => setNominalBlokirInput(e.target.value.replace(/\D/g, ''))} placeholder="Nominal blokir (Rp)" inputMode="numeric"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
              <input value={jangkaWaktuInput} onChange={e => setJangkaWaktuInput(e.target.value.replace(/\D/g, ''))} placeholder="Jangka waktu blokir (hari)" inputMode="numeric"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
              <input value={tanggalMulaiInput} onChange={e => setTanggalMulaiInput(e.target.value)} type="date"
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
              <button onClick={simpanDataBlokir} disabled={savingBlokirData}
                className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                {savingBlokirData ? 'Menyimpan...' : 'Simpan Data Blokir'}
              </button>
            </div>
          )}
          {prasyarat.sk_cif_selesai && !prasyarat.surat_pemblokiran_selesai && prasyarat.blokir_data_terisi && (
            <div className="space-y-2">
              {!suratPemblokiran ? (
                <button onClick={bukaSuratPemblokiran} disabled={loadingSuratPemblokiran}
                  className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full disabled:opacity-50">
                  {loadingSuratPemblokiran ? 'Memuat...' : 'Buka & Cetak Surat Pemblokiran →'}
                </button>
              ) : (
                <div className="sheet bg-white border border-gray-200 rounded-lg p-3 text-gray-600 space-y-2" style={{ fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal }}>
                  <div className="no-print text-right">
                    <button onClick={() => window.print()} className="text-[#1A4FA0] font-bold">🖨️ Print</button>
                  </div>
                  <KopPasalDokumen pengaturan={pengaturan} />
                  <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT PERNYATAAN</div>
                  <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>KUASA BLOKIR REKENING & INSTRUKSI PEMINDAHBUKUAN</div>
                  <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {suratPemblokiran.nomor}</div>
                  {(suratPemblokiran.pasal || []).map(p => (
                    <div key={p.nomor}>{renderPasalBlock(p, suratPemblokiran.mergeData)}</div>
                  ))}
                  <SignatureBlokBank namaPemberi={u.name} />
                  <div className="no-print bg-red-50 text-red-600 rounded p-2">
                    Cetak, tanda tangani di atas materai asli, pindai halaman ini, lalu unggah di bawah — baru kirim salinan fisik ke kantor JM Travel Jakarta.
                  </div>
                  <div className="no-print">
                    <UploadScanDokumen label="Scan Surat Pemblokiran (materai + TTD)" uploadUrl="/api/admin/upload-dokumen-sahabat-fisik"
                      userId={user.id} path={u.dokumen_surat_pemblokiran_fisik_path} uploadedAt={null}
                      extraFields={{ jenis: 'surat_pemblokiran' }} onUploaded={() => muat()} />
                  </div>
                </div>
              )}
            </div>
          )}
          {!prasyarat.sk_cif_selesai && !prasyarat.surat_pemblokiran_selesai && (
            <div className="text-xs text-gray-400">Selesaikan SK-CIF dulu di atas.</div>
          )}
        </Item>

        {pendaftaran.status === 'active' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🎉</div>
            <div className="font-bold text-green-700">Anda sudah jadi Jamaah Sahabat Baitullah aktif!</div>
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
          .sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>
    </Layout>
  );
}
