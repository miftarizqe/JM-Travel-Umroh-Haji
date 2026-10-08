'use client';
import { useEffect, useRef, useState } from 'react';
import InputTanggal from '@/app/components/InputTanggal';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import PdfDokumenResmi from '@/app/components/PdfDokumenResmi';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { usePengaturan, waLink } from '@/lib/usePengaturan';
import { renderPasalBlock, FONT_DOKUMEN, UKURAN_DOKUMEN } from '@/lib/pasalMarkup';

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
  const [namaPemilikUmrohInput, setNamaPemilikUmrohInput] = useState('');
  const [savingRekUmroh, setSavingRekUmroh] = useState(false);
  const [rekeningSahabat, setRekeningSahabat] = useState([]);

  // Preview gabungan SK-CIF + Surat Pemblokiran buat step "baca & setuju".
  const [skCif, setSkCif] = useState(null);
  const [suratPemblokiran, setSuratPemblokiran] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sudahBacaGabungan, setSudahBacaGabungan] = useState(false);
  const scrollGabunganRef = useRef(null);
  const [setujuGabungan, setSetujuGabungan] = useState(false);
  const [submittingSetuju, setSubmittingSetuju] = useState(false);
  const [generatingPdfSkCif, setGeneratingPdfSkCif] = useState(false);

  // Metode TTD fisik SEMENTARA (SPK-AK/SK-CIF/Surat Pemblokiran, vendor
  // esign belum siap — dikonfirmasi user 2026-09-30). 'kantor' butuh tanggal
  // rencana kunjungan, 'kirim' langsung lanjut print-scan-unggah seperti biasa.
  const [tanggalKunjunganInput, setTanggalKunjunganInput] = useState('');
  const [savingMetodeTtd, setSavingMetodeTtd] = useState(false);
  // Pilihan metode TTD = 2 kartu setara, pilih dulu baru disimpan
  // (dikonfirmasi user 2026-10-08) — dulu "kirim sendiri" langsung kesimpan
  // sekali klik & opsi "datang kantor" ketutup, user gak sadar ada 2 pilihan.
  const [pilihanMetode, setPilihanMetode] = useState(null);
  const [gantiMetode, setGantiMetode] = useState(false);

  // Sudah/belum punya rekening BSI (dikonfirmasi user 2026-09-30) — cuma
  // pilihan tampilan lokal, gak perlu disimpan ke server. Yang UDAH PUNYA
  // rekening BSI biasa cuma perlu panduan buka Tabungan Umroh (BSI Byond)
  // aja. Yang BELUM PUNYA cuma perlu panduan buka Rekening BSI (biasa) —
  // file itu SUDAH TERMASUK cara buka Tabungan Umroh-nya juga, jadi panduan
  // Tabungan Umroh terpisah gak perlu ditampilkan lagi buat kasus ini.
  const [sudahPunyaRekeningBsi, setSudahPunyaRekeningBsi] = useState(null);

  // Bantuan BSI manual (dikonfirmasi user 2026-10-03) -- gak semua KTP bisa
  // daftar Tabungan Umroh via BYOND self-service, jamaah yang kejebak bisa
  // setuju identitasnya diserahkan JM Travel ke BSI buat dibukain rekening
  // manual ke cabang. Rekening tetap kosong sampai admin isi manual.
  const [bantuanBsiManualView, setBantuanBsiManualView] = useState(false);
  const [setujuBantuanBsi, setSetujuBantuanBsi] = useState(false);
  const [savingBantuanBsi, setSavingBantuanBsi] = useState(false);

  async function kirimBantuanBsiManual() {
    if (!setujuBantuanBsi) { alert('Centang persetujuan dulu'); return; }
    setSavingBantuanBsi(true);
    try {
      const res = await fetch('/api/sahabat/bantuan-bsi-manual', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setuju: true }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSavingBantuanBsi(false); return; }
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingBantuanBsi(false);
  }

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

  async function simpanRekening(field, nilai, setSaving, namaPemilik) {
    if (!nilai.trim()) { alert('Isi nomor rekening dulu'); return; }
    if (field === 'no_rekening_tabungan_umroh' && !namaPemilik?.trim()) { alert('Isi nama pemilik rekening dulu'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/sahabat/rekening-bsi', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, no_rekening: nilai.trim(), nama_pemilik: namaPemilik?.trim() }),
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
      setGantiMetode(false); setPilihanMetode(null); setTanggalKunjunganInput('');
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setSavingMetodeTtd(false);
  }

  function bukaGantiMetode() {
    setPilihanMetode(u.metode_ttd_sahabat || null);
    // Tanggal lokal (bukan slice ISO UTC — bisa mundur sehari di WIB).
    const t = u.rencana_kunjungan_kantor_at ? new Date(u.rencana_kunjungan_kantor_at) : null;
    setTanggalKunjunganInput(t && !isNaN(t) ? `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` : '');
    setGantiMetode(true);
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

  // Pasal salah satu surat belum diisi admin — jangan biarkan disetujui.
  const pasalGabunganKosong = !!(skCif && suratPemblokiran) &&
    (!(skCif.pasal || []).length || !(suratPemblokiran.pasal || []).length);

  function cekScrollGabungan() {
    const el = scrollGabunganRef.current;
    if (!el || pasalGabunganKosong) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setSudahBacaGabungan(true);
  }

  // Isi pendek (gak sampai bikin kotak bisa di-scroll) gak pernah memicu
  // onScroll — cek sekali begitu kedua surat selesai dirender (sama seperti /pks).
  useEffect(() => {
    if (skCif && suratPemblokiran) cekScrollGabungan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skCif, suratPemblokiran]);

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
        <button onClick={() => router.push('/daftar-sahabat')} className="mt-2 bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full hover:bg-[#0E2F6E] transition-colors cursor-pointer">
          Isi Data Diri →
        </button>
      </div>
    </div></Layout>;
  }

  // No. CIF BSI DICABUT dari funnel (dikonfirmasi user 2026-09-27) — gak
  // perlu diisi jamaah lagi & gak ada di output SK-CIF juga, satu-satunya
  // syarat sisa buat lanjut baca SK-CIF cuma data blokir rekening.
  const cifDanBlokirLengkap = prasyarat.blokir_data_terisi;

  // Step terakhir "Metode TTD & Kirim Dokumen" selesai kalau: pilih datang
  // kantor (TTD di tempat, gak ada unggahan yang perlu dicek di sini), ATAU
  // pilih kirim sendiri DAN ketiga scan (SPK-AK, SK-CIF, Surat Pemblokiran)
  // sudah diunggah.
  const dokumenKetigaSelesai = prasyarat.spk_ak_selesai && prasyarat.sk_cif_selesai && prasyarat.surat_pemblokiran_selesai;
  const metodeTtdSelesai = u.metode_ttd_sahabat === 'kantor' || (u.metode_ttd_sahabat === 'kirim' && dokumenKetigaSelesai);

  // Isi SK-CIF + Surat Pemblokiran — dipakai di step baca & setuju, dan
  // bisa dibuka lagi (read-only) setelah disetujui (dikonfirmasi user 2026-10-08).
  const isiSuratGabungan = skCif && suratPemblokiran ? (
    <div ref={scrollGabunganRef} onScroll={cekScrollGabungan}
      className="max-h-[350px] overflow-y-auto border border-gray-200 rounded-lg p-3 text-gray-600 space-y-4"
      style={{ fontFamily: FONT_DOKUMEN, fontSize: UKURAN_DOKUMEN.normal }}>
      <div>
        <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT KUASA KERJASAMA MULTI CIF</div>
        <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {skCif.nomor}</div>
        {(skCif.pasal || []).map(p => (<div key={`skcif-${p.nomor}`}>{renderPasalBlock(p, skCif.mergeData)}</div>))}
        {!(skCif.pasal || []).length && (
          <div className="text-center text-red-500 py-4">Isi surat belum tersedia. Silakan hubungi admin JM Travel.</div>
        )}
      </div>
      <div className="pt-4 border-t border-gray-100">
        <div className="font-bold text-center" style={{ fontSize: UKURAN_DOKUMEN.judul }}>SURAT PERNYATAAN KUASA BLOKIR REKENING & INSTRUKSI PEMINDAHBUKUAN</div>
        <div className="text-center text-gray-400" style={{ fontSize: UKURAN_DOKUMEN.nomor }}>Nomor: {suratPemblokiran.nomor}</div>
        {(suratPemblokiran.pasal || []).map(p => (<div key={`pemblokiran-${p.nomor}`}>{renderPasalBlock(p, suratPemblokiran.mergeData)}</div>))}
        {!(suratPemblokiran.pasal || []).length && (
          <div className="text-center text-red-500 py-4">Isi surat belum tersedia. Silakan hubungi admin JM Travel.</div>
        )}
      </div>
    </div>
  ) : null;

  const linkHubungiAdmin = (pesan) => waLink(pengaturan?.wa_kantor, pesan) || '#';

  return (
    <Layout title="🤝 Status Pendaftaran Sahabat Baitullah" showBack>
      <div className="max-w-xl mx-auto space-y-3">
        <div className="no-print space-y-3">
        <div className="bg-[#E8F0FB] rounded-xl p-3 text-xs text-[#1A4FA0]">
          Program Sahabat Baitullah — ikuti langkah di bawah sampai selesai untuk jadi Jamaah Sahabat Baitullah aktif.
        </div>

        {/* Urutan FINAL (dikonfirmasi user 2026-10-02): SPK-AK -> Bukti TF ->
            Rekening Tabungan Umroh -> SK-CIF & Blokir -> Metode TTD & Kirim
            Dokumen — SPK-AK sekarang dibaca & disetujui DULUAN sebelum bayar
            (dibalik lagi dari urutan 2026-09-27 yang naruh bukti TF duluan
            biar materai e-sign nanti, provider Peruri, gak kebakar buat
            orang yang belum bayar). Proteksi itu TIDAK relevan sekarang
            karena TTD masih fisik semua (SPK_AK_SEMENTARA_FISIK, belum ada
            materai digital yang beneran kebakar pas klik "Setuju") — kalau
            nanti e-sign live, gate-nya perlu dipikir ulang. */}
        {/* spk_ak_disetujui (checkbox di /pks) — GERBANG funnel di sini,
            BUKAN spk_ak_selesai (materai+TTD beneran, baru diproses server
            pas admin klik "Aktifkan" di ujung, dikonfirmasi user 2026-09-28
            biar e-materai gak kebakar duluan). */}
        <Item done={prasyarat.spk_ak_disetujui} label="Surat Perjanjian Jamaah Sahabat Baitullah">
          {!prasyarat.spk_ak_disetujui && (
            <button onClick={() => router.push('/pks?jenis=sahabat_baitullah')} className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full hover:bg-[#D3E2F7] transition-colors cursor-pointer">
              Baca & Setujui Surat Perjanjian Jamaah Sahabat Baitullah →
            </button>
          )}
          {prasyarat.spk_ak_disetujui && (
            <div className="text-xs text-gray-500">
              Sudah disetujui.{!prasyarat.spk_ak_selesai && ' Tanda tangan fisiknya digabung dengan SK-CIF & Surat Pemblokiran di langkah selanjutnya.'}
            </div>
          )}
        </Item>

        <Item done={prasyarat.bukti_tf_verified} label={prasyarat.bukti_tf_verified ? 'Bukti transfer terunggah' : 'Unggah bukti transfer Rp1.000.000'}>
          {!prasyarat.spk_ak_disetujui && <div className="text-xs text-gray-400">Baca & setujui Surat Perjanjian Jamaah Sahabat Baitullah dulu di atas.</div>}
          {prasyarat.spk_ak_disetujui && !prasyarat.bukti_tf_uploaded && (
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
          {/* Bukti TF bisa dilihat lagi, tapi gantinya lewat admin — unggah
              ulang sendiri bakal nyatat setoran Rp1jt dobel di rekening
              Sahabat Baitullah (lihat upload-bukti-tf/route.js). */}
          {prasyarat.bukti_tf_uploaded && pendaftaran.bukti_tf_path && (
            <div className="space-y-1">
              <a href={pendaftaran.bukti_tf_path} target="_blank" rel="noopener noreferrer"
                className="text-xs font-bold text-[#1A4FA0] underline hover:text-[#0E2F6E] transition-colors">📄 Lihat bukti transfer</a>
              <div className="text-[10px] text-gray-400">
                Salah unggah? <a href={linkHubungiAdmin('Assalamu\'alaikum JM Travel, saya ingin mengganti bukti transfer pendaftaran Sahabat Baitullah saya.')}
                  target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 transition-colors">Hubungi admin</a> untuk menggantinya.
              </div>
            </div>
          )}
        </Item>

        <Item done={prasyarat.rekening_umroh_terisi} label="Rekening Tabungan Umroh">
          {!prasyarat.bukti_tf_verified && <div className="text-xs text-gray-400">Bayar pendaftaran (bukti transfer) dulu di atas.</div>}
          {prasyarat.bukti_tf_verified && (
            prasyarat.rekening_umroh_terisi ? (
              u.no_rekening_tabungan_umroh ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{u.no_rekening_tabungan_umroh}{u.nama_pemilik_rekening_umroh && <> a.n. {u.nama_pemilik_rekening_umroh}</>}</div>
                  {/* Koreksi rekening cuma lewat admin (FIELD_ADMIN_ONLY di
                      /api/profil) — nomornya ikut tercetak di SK-CIF & Surat
                      Pemblokiran, jadi perubahannya perlu dicek admin. */}
                  <div className="text-[10px] text-gray-400">
                    Salah nomor/nama? <a href={linkHubungiAdmin('Assalamu\'alaikum JM Travel, saya ingin mengoreksi nomor/nama Rekening Tabungan Umroh saya.')}
                      target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800 transition-colors">Hubungi admin</a> untuk mengoreksi.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-amber-600">⏳ Menunggu pembuatan rekening manual oleh BSI — admin JM Travel akan infokan begitu selesai.</div>
              )
            ) : sudahPunyaRekeningBsi === null ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">Apakah Anda sudah punya rekening BSI (biasa)?</div>
                <div className="flex gap-2">
                  <button onClick={() => setSudahPunyaRekeningBsi(true)}
                    className="flex-1 text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-2 rounded-lg hover:bg-[#D3E2F7] transition-colors cursor-pointer">
                    ✅ Sudah Punya
                  </button>
                  <button onClick={() => setSudahPunyaRekeningBsi(false)}
                    className="flex-1 text-xs font-bold text-gray-600 bg-gray-100 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
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
                    className="text-xs font-bold text-[#1A4FA0] underline block hover:text-[#0E2F6E] transition-colors">📘 Panduan Buka Tabungan Umroh (BSI Byond)</a>
                )}
                {!sudahPunyaRekeningBsi && pengaturan?.panduan_buka_rekening_bsi_path && (
                  <a href={pengaturan.panduan_buka_rekening_bsi_path} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold text-[#1A4FA0] underline block hover:text-[#0E2F6E] transition-colors">📘 Panduan Buka Rekening BSI (sudah termasuk Tabungan Umroh)</a>
                )}

                {bantuanBsiManualView ? (
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 space-y-2">
                    <div className="text-xs text-gray-700">Apakah Anda setuju identitas Anda diserahkan ke pihak Bank BSI untuk dibukakan rekening?</div>
                    <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={setujuBantuanBsi} onChange={e => setSetujuBantuanBsi(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#1A4FA0]" />
                      Saya setuju identitas saya diserahkan ke pihak Bank BSI untuk dibukakan rekening Tabungan Umroh.
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => { setBantuanBsiManualView(false); setSetujuBantuanBsi(false); }}
                        className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">Batal</button>
                      <button onClick={kirimBantuanBsiManual} disabled={savingBantuanBsi || !setujuBantuanBsi}
                        className="flex-1 bg-[#1A4FA0] text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 enabled:hover:bg-[#0E2F6E] transition-colors cursor-pointer disabled:cursor-not-allowed">
                        {savingBantuanBsi ? '...' : 'Lanjutkan'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Kolom isian rekening cuma buat yang SUDAH punya rekening BSI
                        (dikonfirmasi user 2026-10-08) -- yang belum punya diarahkan
                        ke panduan / bantuan manual JM di bawah. */}
                    {sudahPunyaRekeningBsi && (<>
                    <input value={rekUmrohInput} maxLength={20} inputMode="numeric"
                      onChange={e => setRekUmrohInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Nomor rekening tabungan umroh"
                      className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                    <div className="flex gap-2">
                      <input value={namaPemilikUmrohInput} maxLength={255}
                        onChange={e => setNamaPemilikUmrohInput(e.target.value)}
                        placeholder="Nama pemilik rekening (sesuai buku tabungan)"
                        className="flex-1 px-3 py-2 rounded-lg border-2 border-gray-200 text-sm focus:border-[#1A4FA0] focus:outline-none" />
                      <button onClick={() => simpanRekening('no_rekening_tabungan_umroh', rekUmrohInput, setSavingRekUmroh, namaPemilikUmrohInput)} disabled={savingRekUmroh}
                        className="bg-[#1A4FA0] text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50 enabled:hover:bg-[#0E2F6E] transition-colors cursor-pointer disabled:cursor-not-allowed">
                        {savingRekUmroh ? '...' : 'Simpan'}
                      </button>
                    </div>
                    </>)}
                    {/* Gak semua KTP bisa daftar via BYOND self-service (dikonfirmasi
                        user 2026-10-03) -- cuma relevan buat yang BELUM punya rekening
                        BSI sama sekali (yang sudah punya tinggal buka Tabungan Umroh,
                        gak ada hambatan serupa). */}
                    {!sudahPunyaRekeningBsi && (
                      <button onClick={() => setBantuanBsiManualView(true)}
                        className="text-sm font-semibold text-amber-900 bg-amber-100 border-2 border-amber-400 px-3 py-2.5 rounded-lg block w-full text-left leading-snug hover:bg-amber-200 transition-colors cursor-pointer">
                        ⚠️ Tidak bisa membuat rekening via BYOND? <span className="font-extrabold text-blue-600 underline">KLIK DI SINI</span> untuk JM bantu pembuatan rekening manual ke cabang pilihan JM Travel
                      </button>
                    )}
                    <button onClick={() => setSudahPunyaRekeningBsi(null)} className="text-[10px] text-gray-400 underline hover:text-gray-600 transition-colors cursor-pointer">← Ganti jawaban</button>
                  </>
                )}
              </div>
            )
          )}
        </Item>

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
                    className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 enabled:hover:bg-[#0E2F6E] transition-colors cursor-pointer disabled:cursor-not-allowed">
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
                  className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full disabled:opacity-50 enabled:hover:bg-[#D3E2F7] transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loadingPreview ? 'Memuat...' : 'Baca SK-CIF & Surat Kuasa Blokir Rekening →'}
                </button>
              ) : (
                <>
                  {/* Dibalikin ke teks pasal DB (dikonfirmasi user
                      2026-10-03) — PDF template di iframe gak kebaca di
                      Android/Samsung Browser, cuma muncul ikon PDF generik
                      (bukan buat dibaca langsung). Cetak/TTD fisik TETAP
                      pakai template PDF resmi (tombol "Unduh Dokumen
                      Lengkap" di langkah selanjutnya), gak kesentuh. */}
                  {isiSuratGabungan}
                  {!sudahBacaGabungan && !pasalGabunganKosong && (
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
                    className="w-full bg-[#1A4FA0] text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-40 enabled:hover:bg-[#0E2F6E] transition-colors cursor-pointer disabled:cursor-not-allowed">
                    {submittingSetuju ? 'Menyimpan...' : '✅ Setuju & Lanjutkan'}
                  </button>
                </>
              )}
            </div>
          )}

          {prasyarat.setuju_sk_cif_pemblokiran && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Sudah dibaca & disetujui.</div>
              {isiSuratGabungan ? (
                <>
                  {isiSuratGabungan}
                  <button onClick={() => { setSkCif(null); setSuratPemblokiran(null); }}
                    className="text-[10px] text-gray-400 underline hover:text-gray-600 transition-colors cursor-pointer">Tutup</button>
                </>
              ) : (
                <button onClick={bukaPreviewGabungan} disabled={loadingPreview}
                  className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full disabled:opacity-50 enabled:hover:bg-[#D3E2F7] transition-colors cursor-pointer disabled:cursor-not-allowed">
                  {loadingPreview ? 'Memuat...' : '📖 Baca Lagi SK-CIF & Surat Kuasa Blokir Rekening'}
                </button>
              )}
            </div>
          )}
        </Item>

        {/* Step TERAKHIR dari sisi jamaah (dikonfirmasi user 2026-10-02) —
            gabungan "pilih metode TTD" + "cetak & kirim/unggah ketiga
            dokumen" (SPK-AK, SK-CIF, Surat Pemblokiran) jadi SATU step,
            biar jamaah gak bolak-balik ke 2 tempat kayak sebelumnya (SPK-AK
            dulu dicetak terpisah dari SK-CIF+Pemblokiran). SPK-AK (Muslim)
            BALIK LAGI jadi 2 RANGKAP fisik (dikonfirmasi user 2026-10-03,
            supersede catatan "1 rangkap" 2026-10-02 di atas) — 1 rangkap
            materai+TTD di sisi JAMAAH (ujungnya disimpan kantor), 1 rangkap
            materai+TTD di sisi MANAGEMENT (ujungnya balik ke jamaah),
            digabung otomatis jadi 1 file PDF 12 halaman lewat
            buatPdfSpkAkUntukUser (lihat spkAkUntukUser.js) — SPK-AK
            Non-Muslim belum dapat template 2-rangkap, masih 1 dokumen.
            Ketiga jenis dokumen tetap jadi SATU tempat baca/unduh via
            /api/sahabat/dokumen-legal/unduh-lengkap, SELAIN unduhan
            terpisah yang sudah ada. */}
        <Item done={metodeTtdSelesai} label="Metode TTD & Kirim Dokumen (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran)">
          {!prasyarat.setuju_sk_cif_pemblokiran && <div className="text-xs text-gray-400">Baca & setujui SK-CIF & Surat Kuasa Blokir Rekening dulu di atas.</div>}

          {prasyarat.setuju_sk_cif_pemblokiran && (
            <div className="space-y-3">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-700">
                📌 Siapkan <b>3 lembar Materai Rp10.000</b> — masing-masing 1 untuk Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF, dan Surat Pemblokiran.
              </div>

              {/* Metode TTD WAJIB dipilih DULU (dikonfirmasi user 2026-10-03)
                  — dokumen (viewer/unduhan) cuma relevan buat yang pilih
                  "kirim sendiri"; yang "datang kantor" gak perlu diarahkan
                  unduh apa-apa sama sekali, dokumennya udah disiapin admin
                  (lihat tombol "Cetak Dokumen" di Database Jamaah). */}
              {(!u.metode_ttd_sahabat || gantiMetode) && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600">Pilih <b>salah satu dari 2 cara</b> berikut untuk menandatangani ketiga dokumen di atas materai asli:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: 'kirim', icon: '📄', judul: 'Cetak & Kirim Sendiri', ket: 'Print dokumen, TTD di atas materai asli, lalu kirim fisik ke kantor via pos/kurir.' },
                      { key: 'kantor', icon: '🏢', judul: 'Datang ke Head Office', ket: 'TTD ketiga dokumen langsung di kantor JM Travel, bawa 3 materai. Pilih tanggal kunjungan.' },
                    ].map(o => {
                      const aktif = pilihanMetode === o.key;
                      return (
                        <button key={o.key} type="button" onClick={() => setPilihanMetode(o.key)}
                          className={`text-left rounded-lg border-2 p-3 transition-colors cursor-pointer ${aktif ? 'border-[#1A4FA0] bg-[#E8F0FB]' : 'border-gray-200 bg-white hover:border-[#1A4FA0]/50 hover:bg-gray-50'}`}>
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${aktif ? 'border-[#1A4FA0]' : 'border-gray-300'}`}>
                              {aktif && <span className="w-2 h-2 rounded-full bg-[#1A4FA0]" />}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-[#0E2F6E]">{o.icon} {o.judul}</div>
                              <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{o.ket}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {pilihanMetode === 'kantor' && (
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Tanggal rencana kunjungan:</div>
                      <InputTanggal value={tanggalKunjunganInput} onChange={e => setTanggalKunjunganInput(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border-2 border-gray-200 text-xs focus:border-[#1A4FA0] focus:outline-none" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {gantiMetode && (
                      <button onClick={() => { setGantiMetode(false); setPilihanMetode(null); setTanggalKunjunganInput(''); }}
                        className="text-xs font-bold text-gray-500 bg-gray-100 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">Batal</button>
                    )}
                    <button onClick={() => pilihMetodeTtd(pilihanMetode)}
                      disabled={savingMetodeTtd || !pilihanMetode || (pilihanMetode === 'kantor' && !tanggalKunjunganInput)}
                      className="flex-1 bg-[#1A4FA0] text-white text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 enabled:hover:bg-[#0E2F6E] transition-colors cursor-pointer disabled:cursor-not-allowed">
                      {savingMetodeTtd ? 'Menyimpan...' : !pilihanMetode ? 'Pilih salah satu cara di atas' : 'Simpan Pilihan'}
                    </button>
                  </div>
                </div>
              )}

              {u.metode_ttd_sahabat === 'kantor' && !gantiMetode && (
                <div className="text-xs text-gray-500 space-y-1">
                  <div>🏢 Anda akan datang ke kantor pada <b>{new Date(u.rencana_kunjungan_kantor_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b> untuk TTD ketiga dokumen langsung.</div>
                  <div>Jangan lupa bawa 3 materai (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF &amp; Surat Pemblokiran) — dokumennya sudah disiapkan kantor, Anda tidak perlu mengunduh/mencetak apa pun.{u.bantuan_bsi_manual_disetujui_at && <> Formulir Pendaftaran Rekening BSI ikut disiapkan juga, gak perlu materai.</>}</div>
                  <button onClick={bukaGantiMetode}
                    className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full hover:bg-[#D3E2F7] transition-colors cursor-pointer">🔄 Ganti Metode TTD</button>
                </div>
              )}

              {u.metode_ttd_sahabat === 'kirim' && !gantiMetode && (
                <div className="space-y-3">
                  <div className="bg-gray-50 border-2 border-gray-100 rounded-lg p-2.5 space-y-2">
                    <div className="text-xs font-bold text-[#0E2F6E]">📑 Dokumen Lengkap Sahabat Baitullah</div>
                    <div className="text-[10px] text-gray-500">
                      {u.bantuan_bsi_manual_disetujui_at
                        ? 'Keempat dokumen (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF, Surat Pemblokiran, Formulir Pendaftaran Rekening BSI) bisa dibaca & diunduh di sini kapan saja.'
                        : 'Ketiga dokumen (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF, Surat Pemblokiran) bisa dibaca & diunduh di sini kapan saja.'}
                    </div>
                    <PdfDokumenResmi url="/api/sahabat/dokumen-legal/unduh-lengkap" tinggi="50vh" />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                      <button onClick={() => window.open('/api/sahabat/dokumen-legal/unduh-lengkap', '_blank')}
                        className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full hover:bg-[#D3E2F7] transition-colors cursor-pointer">
                        ⬇️ Unduh Dokumen Lengkap ({u.bantuan_bsi_manual_disetujui_at ? 4 : 3} Dokumen)
                      </button>
                      <span className="text-[10px] text-gray-400">atau unduh terpisah:</span>
                      <button onClick={() => window.open('/api/sahabat/unduh-spk-ak', '_blank')} className="text-[10px] font-bold text-[#1A4FA0] underline hover:text-[#0E2F6E] transition-colors cursor-pointer">Surat Perjanjian Jamaah Sahabat Baitullah</button>
                      <button onClick={unduhPdfSkCif} disabled={generatingPdfSkCif} className="text-[10px] font-bold text-[#1A4FA0] underline disabled:opacity-50 enabled:hover:text-[#0E2F6E] transition-colors cursor-pointer disabled:cursor-not-allowed">
                        {generatingPdfSkCif ? 'Membuat...' : 'SK-CIF & Surat Pemblokiran'}
                      </button>
                    </div>
                  </div>

                  {/* Scan/unggah DICABUT dari sisi jamaah (dikonfirmasi user
                      2026-10-03) — tracking-nya sekarang murni "diterima
                      fisik di kantor" yang dicentang admin (lihat Database
                      Jamaah), bukan lagi self-report scan jamaah. */}
                  <div className="text-xs text-gray-500">
                    📄 Print, TTD di atas materai asli pada kolom TTD Anda, lalu kirim fisik ketiganya ke kantor JM Travel melalui pos/kurir{pengaturan?.alamat_kantor ? ` (${pengaturan.alamat_kantor})` : ''}.
                  </div>
                  <a href={waLink(pengaturan?.wa_kantor, 'Assalamu\'alaikum JM Travel, saya membutuhkan bantuan terkait Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran.') || '#'}
                    target="_blank" rel="noopener noreferrer" className="text-green-600 font-bold text-xs hover:text-green-700 hover:underline transition-colors">
                    Hubungi Admin via WhatsApp
                  </a>
                  <button onClick={bukaGantiMetode}
                    className="block text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] px-3 py-1.5 rounded-full hover:bg-[#D3E2F7] transition-colors cursor-pointer">🔄 Ganti Metode TTD</button>
                </div>
              )}
            </div>
          )}
        </Item>
        </div>

        <div className="no-print space-y-3">
        {/* Style beda sengaja dari Item abu-abu "belum selesai" di atas
            (dikonfirmasi tim desain 2026-09-29) — status INI justru bagus
            (semua langkah udah kelar dari sisi jamaah), jadi tampilannya
            dibikin reassuring/hangat, bukan kesan "kaku nunggu doang".
            Judul & isi DIBEDAKAN tergantung status (dulu berdasar unggah
            scan jamaah, SEKARANG berdasar konfirmasi admin dokumen fisik
            sudah diterima di kantor — dikonfirmasi user 2026-10-03, scan
            sudah dicabut dari sisi jamaah). */}
        {prasyarat.setuju_sk_cif_pemblokiran && u.metode_ttd_sahabat && pendaftaran.status !== 'active' && (
          <div className="bg-[#E8F0FB] border border-[#c9d9f0] rounded-xl p-4 text-center">
            <div className="text-3xl mb-1">🙌</div>
            {metodeTtdSelesai ? (
              <>
                <div className="font-bold text-[#0E2F6E]">Seluruh Persyaratan Telah Lengkap</div>
                <div className="text-xs text-[#1A4FA0] mt-1.5 leading-relaxed">
                  {u.metode_ttd_sahabat === 'kantor'
                    ? `Data Anda sedang ditinjau oleh admin dan akun akan segera diaktifkan setelah Anda TTD ketiga dokumen langsung di kantor pada tanggal yang dipilih.`
                    : `Data Anda sedang ditinjau oleh admin dan akun akan segera diaktifkan. Dokumen fisik asli (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran) yang Anda kirim sudah diterima & dikonfirmasi oleh kantor JM Travel.`}
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-[#0E2F6E]">Persyaratan Utama Telah Lengkap</div>
                <div className="text-xs text-[#1A4FA0] mt-1.5 leading-relaxed">
                  Data Anda sudah dapat ditinjau oleh admin. Agar proses aktivasi akun dapat diselesaikan, pastikan Anda sudah mengirim dokumen fisik asli (Surat Perjanjian Jamaah Sahabat Baitullah, SK-CIF & Surat Pemblokiran) yang sudah ditandatangani di atas materai asli ke kantor JM Travel — akun akan diaktifkan setelah kantor mengonfirmasi dokumen tersebut diterima.
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
            <button onClick={() => router.push('/dashboard/sahabat')} className="mt-2 bg-[#1A4FA0] text-white text-sm font-bold px-5 py-2 rounded-full hover:bg-[#0E2F6E] transition-colors cursor-pointer">
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
