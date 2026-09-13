'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import PasswordInput from '@/app/components/PasswordInput';
import StatusPendaftaranModal from '@/app/components/StatusPendaftaranModal';

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
  const [formRekening, setFormRekening] = useState({
    nik: '', alamat: '', bank: '', no_rekening: '', nama_pemilik_rekening: '', no_paspor: '',
    no_rekening_bsi_biasa: '', no_rekening_tabungan_umroh: '',
  });
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

  const FIELD_SENSITIF_REKENING = ['nik', 'bank', 'no_rekening', 'no_rekening_bsi_biasa', 'no_rekening_tabungan_umroh'];
  const isAdminSelf = ['admin', 'super_admin'].includes(user?.role);

  const isDirty = editing && user && (
    form.name !== (user.name || '') ||
    form.email !== (user.email || '') ||
    form.wa !== (user.wa || '')
  );
  const isDirtyRekening = editingRekening && user && Object.keys(formRekening).some(k => formRekening[k] !== (user[k] || ''));
  useUnsavedGuard(isDirty || isDirtyRekening);

  useEffect(() => {
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
          setFormRekening({
            nik: d.user.nik || '', alamat: d.user.alamat || '', bank: d.user.bank || '',
            no_rekening: d.user.no_rekening || '', nama_pemilik_rekening: d.user.nama_pemilik_rekening || '',
            no_paspor: d.user.no_paspor || '',
            no_rekening_bsi_biasa: d.user.no_rekening_bsi_biasa || '', no_rekening_tabungan_umroh: d.user.no_rekening_tabungan_umroh || '',
          });
          // Segarkan cache lokal
          localStorage.setItem('user', JSON.stringify({ ...parsed, ...d.user }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    setLoadingRiwayat(true);
    fetch('/api/profil/riwayat-umroh')
      .then(r => r.json())
      .then(d => setRiwayatUmroh(d.riwayat || []))
      .catch(() => setRiwayatUmroh([]))
      .finally(() => setLoadingRiwayat(false));
  }, []);

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
    const payload = isAdminSelf ? { ...formRekening } : { alamat: formRekening.alamat, no_paspor: formRekening.no_paspor };
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
        const updated = { ...user, ...payload };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
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
    if (!pwForm.password_baru || pwForm.password_baru.length < 6) { alert('Password baru minimal 6 karakter!'); return; }
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

            {user.kode_unik && (
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
                <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inp}/>
              </div>
              <div>
                <label className={lbl}>No. WhatsApp *</label>
                <input value={form.wa} onChange={e => setForm({...form, wa: e.target.value})} className={inp}/>
              </div>
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
                  <div>
                    <label className={lbl}>NIK</label>
                    <input value={formRekening.nik} onChange={e => setFormRekening({...formRekening, nik: e.target.value})} className={inp}/>
                  </div>
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
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
                  NIK &amp; data rekening cuma bisa diubah admin. Hubungi admin JM Travel kalau ada yang perlu dikoreksi.
                </div>
              )}
              <div>
                <label className={lbl}>Alamat</label>
                <input value={formRekening.alamat} onChange={e => setFormRekening({...formRekening, alamat: e.target.value})} className={inp}/>
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
                <div>
                  <label className={lbl}>No. Rekening Tabungan Umroh</label>
                  <input value={formRekening.no_rekening_tabungan_umroh} onChange={e => setFormRekening({...formRekening, no_rekening_tabungan_umroh: e.target.value})} className={inp}/>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditingRekening(false); setFormRekening({
                    nik: user.nik||'', alamat: user.alamat||'', bank: user.bank||'', no_rekening: user.no_rekening||'',
                    nama_pemilik_rekening: user.nama_pemilik_rekening||'', no_paspor: user.no_paspor||'',
                    no_rekening_bsi_biasa: user.no_rekening_bsi_biasa||'',
                    no_rekening_tabungan_umroh: user.no_rekening_tabungan_umroh||'',
                  }); }}
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
                { label: 'Bank', val: user.bank || '-' },
                { label: 'No. Rekening', val: user.no_rekening || '-' },
                { label: 'Nama Pemilik Rekening', val: user.nama_pemilik_rekening || '-' },
              ].map(f => (
                <div key={f.label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400">{f.label}</span>
                  <span className="font-semibold text-[#0E2F6E]">{f.val}</span>
                </div>
              ))}
              {user.role === 'sahabat_baitullah' && (
                <>
                  {/* No. Rekening BSI Biasa dihapus (dikonfirmasi user
                      2026-09-03) — Sahabat Baitullah cuma punya 1 rekening. */}
                  <div className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-400">No. Rekening Tabungan Umroh</span>
                    {user.no_rekening_tabungan_umroh ? (
                      <span className="font-semibold text-[#0E2F6E]">{user.no_rekening_tabungan_umroh}</span>
                    ) : (
                      <button onClick={() => router.push('/status-pendaftaran-sahabat')} className="text-xs font-bold text-[#1A4FA0] underline">Isi di Status Pendaftaran →</button>
                    )}
                  </div>
                </>
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
