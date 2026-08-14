'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

export default function ProfilPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', wa: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ password_lama: '', password_baru: '', konfirmasi: '' });
  const [savingPw, setSavingPw] = useState(false);

  const isDirty = editing && user && (
    form.name !== (user.name || '') ||
    form.email !== (user.email || '') ||
    form.wa !== (user.wa || '')
  );
  useUnsavedGuard(isDirty);

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
          // Segarkan cache lokal
          localStorage.setItem('user', JSON.stringify({ ...parsed, ...d.user }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    jamaah: '🧳 Jamaah', perwakilan: '🏢 Perwakilan', admin: '⚙️ Admin', super_admin: '🔒 Super Admin',
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
                <input type="password" value={pwForm.password_lama} onChange={e => setPwForm({...pwForm, password_lama: e.target.value})} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Password Baru *</label>
                <input type="password" value={pwForm.password_baru} onChange={e => setPwForm({...pwForm, password_baru: e.target.value})} className={inp}/>
              </div>
              <div>
                <label className={lbl}>Konfirmasi Password Baru *</label>
                <input type="password" value={pwForm.konfirmasi} onChange={e => setPwForm({...pwForm, konfirmasi: e.target.value})} className={inp}/>
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
