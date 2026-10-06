'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import PasswordInput from '@/app/components/PasswordInput';
import StatusPendaftaranModal from '@/app/components/StatusPendaftaranModal';
import { AddressFields, alamatLengkap } from '@/app/components/AddressFields';

// Alamat sekarang field terstruktur (AddressFields.jsx), bukan 1 textarea
// bebas lagi (dikonfirmasi user 2026-10-06) — map nama field form ke nama
// kolom users.alamat_ktp_* (kp -> kode_pos, kolom generik lama). Dipakai
// buat prefill DAN cek isDirty (bandingin ke user[kolom], bukan user[key]
// langsung karena nama field-nya beda dari nama kolom DB).
const ALAMAT_KTP_FIELD_MAP = {
  jalan: 'alamat_ktp_jalan', norumah: 'alamat_ktp_no_rumah', rt: 'alamat_ktp_rt', rw: 'alamat_ktp_rw',
  kel: 'alamat_ktp_kelurahan', kec: 'alamat_ktp_kecamatan', kota: 'alamat_ktp_kota',
  provinsi: 'alamat_ktp_provinsi', negara: 'alamat_ktp_negara', kp: 'kode_pos',
};
function buildFormRekening(u) {
  const alamatFields = {};
  for (const [field, kolom] of Object.entries(ALAMAT_KTP_FIELD_MAP)) alamatFields[field] = u[kolom] || '';
  return {
    nik: u.nik || '', ...alamatFields, bank: u.bank || '', no_rekening: u.no_rekening || '',
    nama_pemilik_rekening: u.nama_pemilik_rekening || '', no_paspor: u.no_paspor || '',
    no_rekening_bsi_biasa: u.no_rekening_bsi_biasa || '', no_rekening_tabungan_umroh: u.no_rekening_tabungan_umroh || '',
    nama_pemilik_rekening_umroh: u.nama_pemilik_rekening_umroh || '',
  };
}

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

// Label ringkas buat baris "Status Pendaftaran" — salinan kecil dari
// STEP_PENDAFTARAN/STEP_PENDAFTARAN_SAHABAT di masing-masing route.js,
// sama seperti yang dipakai StatusPendaftaranModal.
const STATUS_LABEL = {
  perwakilan: {
    pending: 'Verifikasi Data oleh Admin', docs_sent: 'Perjanjian Dikirim ke Alamat Anda',
    waiting_docs_return: 'Menunggu Rangkapan Dikirim Kembali', waiting_visit: 'Menunggu Kunjungan Kantor',
    active: 'Perwakilan Aktif', ditolak: 'Pendaftaran Ditolak',
  },
  sahabat: {
    pending: 'Upload Bukti Transfer', menunggu_bsi: 'Menunggu Akun BSI & Tabungan Haji',
    menunggu_sk_cif: 'Menunggu SK-CIF', active: 'Jamaah Sahabat Baitullah Aktif', ditolak: 'Pendaftaran Ditolak',
  },
};

export default function ProfilPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', wa: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRekening, setEditingRekening] = useState(false);
  const [formRekening, setFormRekening] = useState(() => buildFormRekening({}));
  const [savingRekening, setSavingRekening] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ password_lama: '', password_baru: '', konfirmasi: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [modalPendaftaran, setModalPendaftaran] = useState(null); // 'perwakilan'|'sahabat_baitullah'|null
  // Riwayat perjalanan umroh (dikonfirmasi user 2026-09-06) — dicocokkan by
  // NIK ke SEMUA booking, termasuk yang dulu "numpang" di akun orang lain
  // sebelum akun ini ada. Lazy-load pas user udah kebaca (butuh NIK-nya).
  const [riwayatUmroh, setRiwayatUmroh] = useState(null);
  const [loadingRiwayat, setLoadingRiwayat] = useState(false);
  const [generatingPdfSkCif, setGeneratingPdfSkCif] = useState(false);

  const FIELD_SENSITIF_REKENING = ['nik', 'bank', 'no_rekening', 'no_rekening_bsi_biasa', 'no_rekening_tabungan_umroh', 'nama_pemilik_rekening_umroh'];
  const isAdminSelf = ['admin', 'super_admin'].includes(user?.role);

  const isDirty = editing && user && (
    form.name !== (user.name || '') ||
    form.email !== (user.email || '') ||
    form.wa !== (user.wa || '')
  );
  const isDirtyRekening = editingRekening && user && Object.keys(formRekening).some(k => {
    const userKey = ALAMAT_KTP_FIELD_MAP[k] || k;
    return formRekening[k] !== (user[userKey] || '');
  });
  useUnsavedGuard(isDirty || isDirtyRekening);

  function muatProfil() {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const parsed = JSON.parse(u);
    // Ambil data TERKINI dari database (bukan cache localStorage)
    fetch(`/api/profil?user_id=${parsed.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setUser(d.user);
          setForm({ name: d.user.name || '', email: d.user.email || '', wa: d.user.wa || '' });
          setFormRekening(buildFormRekening(d.user));
          // Segarkan cache lokal
          localStorage.setItem('user', JSON.stringify({ ...parsed, ...d.user }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    muatProfil();
    setLoadingRiwayat(true);
    fetch('/api/profil/riwayat-umroh')
      .then(r => r.json())
      .then(d => setRiwayatUmroh(d.riwayat || []))
      .catch(() => setRiwayatUmroh([]))
      .finally(() => setLoadingRiwayat(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cetak ulang blanko SK-CIF+Surat Pemblokiran (dipindah dari Beranda ke
  // sini, dikonfirmasi user 2026-09-29 — dokumen dikonsolidasi 1 tempat).
  async function unduhPdfDokumen() {
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

  async function saveProfile() {
    if (!form.name.trim()) { alert('Nama wajib diisi!'); return; }
    if (!form.wa.trim()) { alert('No. WhatsApp wajib diisi!'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, ...form }),
      });
      const d = await res.json();
      if (res.ok) {
        const updated = { ...user, ...d.user };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
        setEditing(false);
        alert(d.message);
      } else {
        alert(d.error || 'Gagal menyimpan profil');
      }
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function saveRekening() {
    // Non-admin cuma boleh kirim `alamat` — field terkunci (NIK/rekening)
    // SENGAJA gak diikutkan sama sekali di body kalau bukan admin, biar
    // gak kena guard 403 di server cuma gara2 field-nya "ada di body"
    // (walau value-nya gak berubah — server ngecek keberadaan key, bukan
    // cuma isinya berubah apa nggak).
    if (!alamatLengkap(formRekening, '')) {
      alert('Alamat wajib diisi lengkap (nama jalan, no. rumah, RT, RW, kelurahan, kecamatan, kota/kabupaten, provinsi, negara)!');
      return;
    }
    const alamatFields = Object.keys(ALAMAT_KTP_FIELD_MAP).reduce((o, k) => ({ ...o, [k]: formRekening[k] }), {});
    const payload = isAdminSelf ? { ...formRekening } : { ...alamatFields, no_paspor: formRekening.no_paspor };
    const berubahSensitif = isAdminSelf ? FIELD_SENSITIF_REKENING.filter(k => formRekening[k] !== (user[k] || '')) : [];
    if (berubahSensitif.length > 0 && !confirm('Yakin ubah data rekening/NIK? Perubahan ini tercatat & admin akan diberi tahu.')) {
      return;
    }
    setSavingRekening(true);
    try {
      const res = await fetch('/api/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, name: user.name, email: user.email, wa: user.wa, ...payload }),
      });
      const d = await res.json();
      if (res.ok) {
        // Refetch (bukan merge optimistic) — server yang nyusun ulang
        // kolom flat alamat/alamat_ktp dari field terstruktur, klien gak
        // tau hasil akhirnya tanpa nanya ulang.
        muatProfil();
        setEditingRekening(false);
        alert(d.message);
      } else {
        alert(d.error || 'Gagal menyimpan');
      }
    } catch { alert('Terjadi kesalahan'); }
    setSavingRekening(false);
  }

  async function savePassword() {
    if (!pwForm.password_lama) { alert('Password lama wajib diisi!'); return; }
    if (!pwForm.password_baru || pwForm.password_baru.length < 8) { alert('Password baru minimal 8 karakter!'); return; }
    if (pwForm.password_baru !== pwForm.konfirmasi) { alert('Konfirmasi password baru tidak cocok!'); return; }
    setSavingPw(true);
    try {
      const res = await fetch('/api/profil/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, password_lama: pwForm.password_lama, password_baru: pwForm.password_baru }),
      });
      const d = await res.json();
      if (res.ok) {
        alert(d.message);
        setChangingPw(false);
        setPwForm({ password_lama: '', password_baru: '', konfirmasi: '' });
      } else {
        alert(d.error || 'Gagal mengubah password');
      }
    } catch { alert('Terjadi kesalahan'); }
    setSavingPw(false);
  }

  async function logout() {
    if (!confirm('Keluar dari akun?')) return;
    // Cookie token httpOnly hanya bisa dihapus oleh server
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('user');
    router.push('/');
  }

  if (loading || !user) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const inp = "w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-[#0E2F6E] mb-1.5";

  const roleLabel = {
    jamaah: '🧳 Jamaah', perwakilan: '🏢 Perwakilan', sahabat: '🤝 Sahabat Baitullah', admin: '⚙️ Admin', super_admin: '🔒 Super Admin',
  }[user.role] || user.role;

  return (
    <Layout title="👤 Profil Saya" confirmLeave={isDirty}
      confirmMessage="Yakin ingin keluar? Perubahan data akun yang belum disimpan akan hilang.">
      <div className="max-w-2xl mx-auto">

        {/* Kartu identitas */}
        <div className="bg-gradient-to-r from-[#0E2F6E] to-[#2060C0] text-white rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Foto profil — dipakai untuk cetak ID Card */}
              <div className="relative flex-shrink-0">
                {user.foto_path ? (
                  <img src={user.foto_path} alt={user.name}
                    className="w-20 h-20 rounded-full object-cover border-4 border-white/30" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-white/15 border-4 border-white/30 flex items-center justify-center text-3xl">
                    👤
                  </div>
                )}
                <button
                  onClick={() => router.push('/upload-foto')}
                  title="Ubah foto profil"
                  className="absolute -bottom-1 -right-1 bg-[#C9952A] hover:bg-yellow-600 w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 border-white transition-colors">
                  ✏️
                </button>
              </div>

              <div>
                <h2 className="text-xl font-bold">{user.name}</h2>
                <p className="text-sm opacity-85 mt-0.5">{roleLabel}</p>
              </div>
            </div>

            {/* Kode unik disembunyikan buat jamaah — belum ada kegunaannya, butuh
                pengembangan lebih lanjut (dikonfirmasi user 2026-09-27). */}
            {user.role !== 'jamaah' && user.kode_unik && (
              <span className="bg-white/15 border border-white/30 rounded-full px-3 py-1 text-xs font-bold flex-shrink-0">
                🔑 {user.kode_unik}
              </span>
            )}
          </div>
        </div>

        {/* Direkrut oleh — hanya relevan untuk perwakilan yang daftar via perekrut */}
        {user.role === 'perwakilan' && user.perekrut_nama && (
          <div className="bg-[#E8F0FB] rounded-xl p-4 mb-6 text-sm flex justify-between items-center">
            <span className="text-gray-500">Direkrut oleh</span>
            <span className="font-bold text-[#0E2F6E]">{user.perekrut_nama}</span>
          </div>
        )}

        {/* Status Keanggotaan Sahabat Baitullah — dipindah dari Beranda ke
            sini (dikonfirmasi user 2026-09-22, biar Beranda fokus ke
            ujroh/aktivitas, bukan status akun). Dokumen (link scan yang
            SUDAH DITANDATANGANI + tombol cetak ulang blanko) DIKONSOLIDASI
            ke sini juga (dikonfirmasi user 2026-09-29 — sebelumnya sempat
            dobel juga ada di Beranda, dihapus dari sana). Link scan
            diprioritaskan (dikonfirmasi user — "buat apa liat yg kosongan"),
            tombol blanko tetap ada di bawahnya buat jaga-jaga kalau
            scan-nya belum sempat diunggah (opsional, boleh nyusul). */}
        {user.role === 'sahabat_baitullah' && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
            <div className="font-bold text-[#0E2F6E] mb-3">📋 Status Keanggotaan</div>
            {/* Nomor CIF BSI dihapus total (dikonfirmasi user 2026-10-01 —
                data rahasia bank, gak diinput siapa pun lagi). */}
            <div className="bg-gray-50 rounded-lg p-2 text-center mb-3">
              <div className="text-lg">{user.tabungan_haji_status ? '✅' : '⏳'}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Tabungan Umroh</div>
            </div>
            {(user.dokumen?.spk_ak || user.dokumen?.sk_cif || user.dokumen?.surat_pemblokiran) && (
              <div className="space-y-1 mb-3">
                <div className="text-[10px] text-gray-400">Dokumen yang sudah ditandatangani (scan):</div>
                {user.dokumen?.spk_ak && (
                  <a href={user.dokumen.spk_ak} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold text-green-700">✅ Surat Perjanjian Jamaah Sahabat Baitullah →</a>
                )}
                {user.dokumen?.sk_cif && (
                  <a href={user.dokumen.sk_cif} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold text-green-700">✅ SK-CIF →</a>
                )}
                {user.dokumen?.surat_pemblokiran && (
                  <a href={user.dokumen.surat_pemblokiran} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold text-green-700">✅ Surat Pemblokiran →</a>
                )}
              </div>
            )}
            <div className="text-[10px] text-gray-400 mb-2">Butuh cetak ulang SK-CIF & Surat Pemblokiran (blanko kosong, identitas Anda sudah terisi otomatis)?</div>
            <button onClick={unduhPdfDokumen} disabled={generatingPdfSkCif}
              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">
              {generatingPdfSkCif ? 'Membuat PDF...' : 'Unduh PDF (SK-CIF & Surat Pemblokiran)'}
            </button>
          </div>
        )}

        {/* Target Impian + Ganti Target Impian PINDAH ke Beranda
            (/dashboard/sahabat, dikonfirmasi user 2026-09-29) — dibarengin
            sama kartu Progress Tabungan yang emang udah ada di sana, biar
            gak kesebar/duplikat 2 tempat. */}

        {/* Voucher Pendaftaran Rp1jt — ikut dipindah dari Beranda (dikonfirmasi
            user 2026-09-22). */}
        {user.role === 'sahabat_baitullah' && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
            <div className="font-bold text-[#0E2F6E] mb-2">🎟️ Voucher Pendaftaran</div>
            {user.voucher_pendaftaran ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-[#0E2F6E]">{user.voucher_pendaftaran.kode} — {fmtRp(user.voucher_pendaftaran.potongan)}</div>
                  <div className="text-[10px] text-gray-400">
                    {user.voucher_pendaftaran.valid_until ? `Berlaku sampai ${new Date(user.voucher_pendaftaran.valid_until).toLocaleDateString('id-ID')}` : 'Tanpa batas waktu'}
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${user.voucher_pendaftaran.blocked_hop ? 'bg-gray-100 text-gray-500' : user.voucher_pendaftaran.used ? 'bg-gray-100 text-gray-500' : user.voucher_pendaftaran.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {user.voucher_pendaftaran.blocked_hop ? 'Tidak berlaku (Head of Program)' : user.voucher_pendaftaran.used ? 'Sudah dipakai' : user.voucher_pendaftaran.aktif ? 'Siap dipakai' : 'Nonaktif'}
                </span>
              </div>
            ) : (
              <div className="text-center text-gray-400 text-sm py-4">Voucher belum diterbitkan admin.</div>
            )}
          </div>
        )}

        {/* Riwayat Perjalanan — dicocokkan by NIK, termasuk trip yang dulu
            "numpang" di booking akun orang lain sebelum akun ini ada
            (dikonfirmasi user 2026-09-06). Cuma tampil kalau ketemu, biar
            gak nambah section kosong buat akun yang emang belum pernah. */}
        {!loadingRiwayat && riwayatUmroh && riwayatUmroh.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
            <div className="font-bold text-[#0E2F6E] mb-1">🕋 Riwayat Perjalanan</div>
            <div className="text-xs text-gray-400 mb-3">Tercatat pernah ikut program berikut bersama JM Travel.</div>
            <div className="space-y-2">
              {riwayatUmroh.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-700 truncate">{r.prog_name}</div>
                    <div className="text-xs text-gray-400">
                      {r.tanggal_berangkat ? new Date(r.tanggal_berangkat).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                    r.status_jamaah === 'Sudah Berangkat' ? 'bg-green-100 text-green-700'
                      : r.status_jamaah === 'Cancel Program' ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>{r.status_jamaah}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data akun */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-bold text-[#0E2F6E]">Data Akun</div>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-xs font-bold text-[#1A4FA0] underline">
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <>
              <div>
                <label className={lbl}>Nama Lengkap *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Email</label>
                {isAdminSelf ? (
                  <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inp}/>
                ) : (
                  <div className={`${inp} bg-gray-50 text-gray-400`}>{form.email || '-'}</div>
                )}
              </div>
              <div>
                <label className={lbl}>No. WhatsApp *</label>
                {isAdminSelf ? (
                  <input value={form.wa} onChange={e => setForm({...form, wa: e.target.value})} className={inp}/>
                ) : (
                  <div className={`${inp} bg-gray-50 text-gray-400`}>{form.wa || '-'}</div>
                )}
              </div>
              {!isAdminSelf && (
                <div className="text-[10px] text-gray-400 -mt-1">Email &amp; No. WhatsApp adalah data verifikasi awal, cuma bisa diubah admin. Hubungi admin JM Travel kalau ada yang perlu dikoreksi.</div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditing(false); setForm({name:user.name||'', email:user.email||'', wa:user.wa||''}); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-full text-sm">
                  Batal
                </button>
                <button onClick={saveProfile} disabled={saving}
                  className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50">
                  {saving ? 'Menyimpan...' : '💾 Simpan'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              {[
                { label: 'Nama', val: user.name },
                { label: 'Email', val: user.email || '-' },
                { label: 'No. WhatsApp', val: user.wa || '-' },
                { label: 'NIK', val: user.nik || '-' },
                { label: 'Status Akun', val: user.status },
              ].map(f => (
                <div key={f.label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400">{f.label}</span>
                  <span className="font-semibold text-[#0E2F6E]">{f.val}</span>
                </div>
              ))}

              {user.pendaftaran_status_perwakilan && (
                <div onClick={() => setModalPendaftaran('perwakilan')}
                  className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 cursor-pointer group">
                  <span className="text-gray-400">Status Pendaftaran (Perwakilan)</span>
                  <span className="font-semibold text-[#1A4FA0] group-hover:underline">{STATUS_LABEL.perwakilan[user.pendaftaran_status_perwakilan] || user.pendaftaran_status_perwakilan} →</span>
                </div>
              )}
              {user.pendaftaran_status_sahabat && (
                <div onClick={() => setModalPendaftaran('sahabat_baitullah')}
                  className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 cursor-pointer group">
                  <span className="text-gray-400">Status Pendaftaran (Sahabat Baitullah)</span>
                  <span className="font-semibold text-[#1A4FA0] group-hover:underline">{STATUS_LABEL.sahabat[user.pendaftaran_status_sahabat] || user.pendaftaran_status_sahabat} →</span>
                </div>
              )}
            </div>
          )}
        </div>

        {modalPendaftaran && (
          <StatusPendaftaranModal tipe={modalPendaftaran} onClose={() => setModalPendaftaran(null)} />
        )}

        {/* Data Rekening & Dokumen — diperluas 2026-08-30. NIK & seluruh
            data rekening SEMPAT dibuka self-service (diaudit), TAPI dikunci
            ulang jadi ADMIN-ONLY sore itu juga (dikonfirmasi user — "ngaruh
            kemana2", terlalu sensitif walau diaudit). `alamat` TETAP
            self-service. Non-admin liat field terkunci sebagai read-only +
            arahan hubungi admin (edit beneran lewat Database Jamaah/
            Database jamaah/perwakilan, bukan halaman ini). */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-bold text-[#0E2F6E]">📇 Data Rekening &amp; Dokumen</div>
            {!editingRekening && (
              <button onClick={() => setEditingRekening(true)} className="text-xs font-bold text-[#1A4FA0] underline">
                Edit
              </button>
            )}
          </div>

          {editingRekening ? (
            <>
              {isAdminSelf ? (
                <>
                  {/* NIK DICABUT dari sini (dikonfirmasi user 2026-10-03) --
                      data identitas resmi, gak boleh diubah sama sekali
                      lewat form (beda dari rekening yang wajar berubah). */}
                  {/* Bank/No. Rekening/Nama Pemilik Rekening generik cuma
                      relevan buat role yang pencairannya ke rekening ini
                      (perwakilan). sahabat_baitullah pakai Tabungan Umroh
                      di bawah, bukan field ini (dikonfirmasi user 2026-10-03). */}
                  {user.role !== 'sahabat_baitullah' && (
                    <>
                      <div>
                        <label className={lbl}>Bank</label>
                        <input value={formRekening.bank} onChange={e => setFormRekening({...formRekening, bank: e.target.value})} className={inp}/>
                      </div>
                      <div>
                        <label className={lbl}>No. Rekening</label>
                        <input value={formRekening.no_rekening} onChange={e => setFormRekening({...formRekening, no_rekening: e.target.value})} className={inp}/>
                      </div>
                      <div>
                        <label className={lbl}>Nama Pemilik Rekening</label>
                        <input value={formRekening.nama_pemilik_rekening} onChange={e => setFormRekening({...formRekening, nama_pemilik_rekening: e.target.value})} className={inp}/>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
                  NIK &amp; data rekening cuma bisa diubah admin. Hubungi admin JM Travel kalau ada yang perlu dikoreksi.
                </div>
              )}
              <div className="space-y-3">
                <div className="font-bold text-[#0E2F6E] text-sm">Alamat</div>
                <AddressFields form={formRekening} setF={(k, v) => setFormRekening(prev => ({ ...prev, [k]: v }))} suffix="" inp={inp} lbl={lbl} />
              </div>
              <div>
                <label className={lbl}>No. Paspor <span className="text-gray-400 font-normal">(opsional, boleh menyusul)</span></label>
                <input value={formRekening.no_paspor} onChange={e => setFormRekening({...formRekening, no_paspor: e.target.value})} className={inp}/>
              </div>
              {isAdminSelf && user.role === 'sahabat_baitullah' && user.no_rekening_bsi_biasa && (
                <div>
                  <label className={lbl}>No. Rekening BSI Biasa</label>
                  <input value={formRekening.no_rekening_bsi_biasa} onChange={e => setFormRekening({...formRekening, no_rekening_bsi_biasa: e.target.value})} className={inp}/>
                </div>
              )}
              {isAdminSelf && user.role === 'sahabat_baitullah' && user.no_rekening_tabungan_umroh && (
                <>
                  <div>
                    <label className={lbl}>No. Rekening Tabungan Umroh</label>
                    <input value={formRekening.no_rekening_tabungan_umroh} onChange={e => setFormRekening({...formRekening, no_rekening_tabungan_umroh: e.target.value})} className={inp}/>
                  </div>
                  <div>
                    <label className={lbl}>Nama Pemilik Rekening (Tabungan Umroh)</label>
                    <input value={formRekening.nama_pemilik_rekening_umroh} onChange={e => setFormRekening({...formRekening, nama_pemilik_rekening_umroh: e.target.value})} className={inp}/>
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditingRekening(false); setFormRekening(buildFormRekening(user)); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-full text-sm">
                  Batal
                </button>
                <button onClick={saveRekening} disabled={savingRekening}
                  className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50">
                  {savingRekening ? 'Menyimpan...' : '💾 Simpan'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              {[
                { label: 'NIK', val: user.nik || '-' },
                { label: 'Alamat', val: user.alamat || '-' },
                { label: 'No. Paspor', val: user.no_paspor || '-' },
              ].map(f => (
                <div key={f.label} className="flex justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400 shrink-0">{f.label}</span>
                  <span className="font-semibold text-[#0E2F6E] text-right">{f.val}</span>
                </div>
              ))}
              {/* Bank/No. Rekening/Nama Pemilik Rekening — sahabat_baitullah
                  cuma punya 1 rekening (Tabungan Umroh, selalu BSI), jadi
                  3 baris ini otomatis ngikut data itu, BUKAN field generik
                  bank/no_rekening/nama_pemilik_rekening (yang dipakai
                  perwakilan buat tujuan pencairan ujroh). Dikonfirmasi user
                  2026-10-03. */}
              {user.role === 'sahabat_baitullah' ? (
                <>
                  <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400">Bank</span>
                    <span className="font-semibold text-[#0E2F6E]">{user.no_rekening_tabungan_umroh ? 'BSI' : '-'}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400">No. Rekening</span>
                    {user.no_rekening_tabungan_umroh ? (
                      <span className="font-semibold text-[#0E2F6E]">{user.no_rekening_tabungan_umroh}</span>
                    ) : (
                      <button onClick={() => router.push('/status-pendaftaran-sahabat')} className="text-xs font-bold text-[#1A4FA0] underline">Isi di Status Pendaftaran →</button>
                    )}
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400">Nama Pemilik Rekening</span>
                    <span className="font-semibold text-[#0E2F6E]">{user.nama_pemilik_rekening_umroh || '-'}</span>
                  </div>
                </>
              ) : (
                [
                  { label: 'Bank', val: user.bank || '-' },
                  { label: 'No. Rekening', val: user.no_rekening || '-' },
                  { label: 'Nama Pemilik Rekening', val: user.nama_pemilik_rekening || '-' },
                ].map(f => (
                  <div key={f.label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400">{f.label}</span>
                    <span className="font-semibold text-[#0E2F6E]">{f.val}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Ganti password */}
        <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="font-bold text-[#0E2F6E]">🔒 Keamanan Akun</div>
            {!changingPw && (
              <button onClick={() => setChangingPw(true)} className="text-xs font-bold text-[#1A4FA0] underline">
                Ganti Password
              </button>
            )}
          </div>
          {changingPw && (
            <>
              <div>
                <label className={lbl}>Password Lama *</label>
                <PasswordInput value={pwForm.password_lama} onChange={e => setPwForm({...pwForm, password_lama: e.target.value})} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Password Baru *</label>
                <PasswordInput value={pwForm.password_baru} onChange={e => setPwForm({...pwForm, password_baru: e.target.value})} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Konfirmasi Password Baru *</label>
                <PasswordInput value={pwForm.konfirmasi} onChange={e => setPwForm({...pwForm, konfirmasi: e.target.value})} className={inp}/>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setChangingPw(false); setPwForm({password_lama:'',password_baru:'',konfirmasi:''}); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-2.5 rounded-full text-sm">
                  Batal
                </button>
                <button onClick={savePassword} disabled={savingPw}
                  className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white font-bold py-2.5 rounded-full text-sm disabled:opacity-50">
                  {savingPw ? 'Menyimpan...' : '💾 Simpan Password'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Ajakan upgrade perwakilan — hanya jamaah yang sudah umroh,
            lewat /upgrade-perwakilan yang ngecek itu. */}
        {user.role === 'jamaah' && user.sudah_umroh && (
          <div className="bg-white border-2 border-[#1A4FA0] rounded-xl p-5 mb-4 cursor-pointer hover:shadow-lg transition-all"
            onClick={() => router.push('/upgrade-perwakilan')}>
            <h4 className="font-bold text-[#0E2F6E] mb-1">🏢 Ingin Jadi Perwakilan JM Travel?</h4>
            <p className="text-sm text-gray-500 mb-3">Kelola program di wilayah Anda sendiri, tentukan harga jual, dan ambil selisih dari HPP.</p>
            <span className="bg-[#1A4FA0] text-white text-xs font-bold px-4 py-1.5 rounded-full">📝 Daftar Sebagai Perwakilan →</span>
          </div>
        )}

        <button onClick={logout}
          className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-full transition-colors">
          🚪 Keluar
        </button>
      </div>
    </Layout>
  );
}
