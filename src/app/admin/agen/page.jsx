'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import BankInput from '@/app/components/BankInput';
import TempatLahirField from '@/app/components/TempatLahirField';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// "Database Account" agen — login minimal cuma buat ambil link referral
// pribadi, gak ada funnel pendaftaran/dashboard (dikonfirmasi user
// 2026-10-17). Admin bikin akun langsung di sini (nama/NIK/email/WA/
// password), kode referral & link kebuat otomatis. Riwayat closing & komisi
// (yang sekarang beneran tercatat di komisi_ledger) pindah ke halaman
// Riwayat Closing & Pencairan Ujroh masing-masing, bukan di sini lagi.
export default function AdminAgenPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nama, setNama] = useState('');
  const [nik, setNik] = useState('');
  const [email, setEmail] = useState('');
  const [wa, setWa] = useState('');
  const [jk, setJk] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  // Field yang gagal validasi (client atau server) dimerahin (dikonfirmasi
  // user 2026-10-21) -- key = nama field, true = tampil merah.
  const [fieldErr, setFieldErr] = useState({});
  // Data tambahan (dikonfirmasi user 2026-10-21, "datanya sayang kalo gak
  // dipake") -- semuanya opsional, kolom generik yang udah ada di users
  // (dipakai perwakilan/sahabat juga).
  const [tempatLahir, setTempatLahir] = useState('');
  const [bank, setBank] = useState('');
  const [noRekening, setNoRekening] = useState('');
  const [namaPemilikRekening, setNamaPemilikRekening] = useState('');
  const [fotoKtpPath, setFotoKtpPath] = useState('');
  const [uploadingKtp, setUploadingKtp] = useState(false);
  const [perekrutId, setPerekrutId] = useState('');
  const [perekrutOptions, setPerekrutOptions] = useState([]);
  // Edit inline per baris (dikonfirmasi user 2026-10-19) -- cuma nama/WA/
  // jenis kelamin yang boleh diubah di sini (NIK/email data identitas,
  // dibiarkan gak bisa diubah lewat panel ini, konsisten sama field lain
  // yang "dikunci" di seluruh app).
  const [editingId, setEditingId] = useState(null);
  const [editNama, setEditNama] = useState('');
  const [editWa, setEditWa] = useState('');
  const [editJk, setEditJk] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  function muatData() {
    fetch('/api/admin/agen')
      .then(r => r.json())
      .then(d => { setRows(d.agen || []); setPerekrutOptions(d.perekrut_options || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function pilihFotoKtp(file) {
    if (!file) return;
    setUploadingKtp(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-ktp', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) setFotoKtpPath(d.path);
      else alert(d.error || 'Gagal mengunggah foto KTP');
    } catch { alert('Terjadi kesalahan saat mengunggah foto KTP'); }
    setUploadingKtp(false);
  }

  useEffect(() => {
    if (!user) return;
    if (!['admin', 'super_admin'].includes(user.role)) { router.replace('/login'); return; }
    muatData();
  }, [user]);

  if (!user || loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  async function buatAkun() {
    // NIK tetap wajib (koreksi 2026-10-21 -- yang opsional itu Foto KTP-nya,
    // bukan NIK). WA opsional. Field yang kosong dimerahin langsung
    // (dikonfirmasi user 2026-10-21 — "kalo ada yang belum sesuai fieldnya
    // dimerahin aja kalo emg wajib"), gak pake alert generik lagi buat kasus
    // ini.
    const kosong = {
      nama: !nama.trim(), nik: !nik.trim(), email: !email.trim(), jk: !jk, password: !password.trim(),
    };
    setFieldErr(kosong);
    if (Object.values(kosong).some(Boolean)) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/agen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: nama.trim(), nik: nik.trim(), email: email.trim(), wa: wa.trim(), jenis_kelamin: jk, password: password.trim(),
          tempat_lahir: tempatLahir.trim(), bank, no_rekening: noRekening.trim(),
          nama_pemilik_rekening: namaPemilikRekening.trim(), foto_ktp_path: fotoKtpPath, perekrut_id: perekrutId || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || 'Gagal membuat akun');
        if (d.field) setFieldErr(prev => ({ ...prev, [d.field]: true }));
        return;
      }
      alert(`Akun agen "${nama}" dibuat. Kode: ${d.kode_unik}. Sampaikan email+password ini ke yang bersangkutan buat login.`);
      setNama(''); setNik(''); setEmail(''); setWa(''); setJk(''); setPassword('');
      setTempatLahir(''); setBank(''); setNoRekening(''); setNamaPemilikRekening(''); setFotoKtpPath(''); setPerekrutId('');
      setFieldErr({});
      muatData();
    } catch {
      alert('Terjadi kesalahan');
    } finally {
      // finally (bukan trailing statement) — BUG ditemukan 2026-10-21:
      // `return` di dalam blok `if (!res.ok)` di atas sebelumnya nyelonong
      // lewatin baris setSaving(false) ini, tombol kejebak "Membuat..."
      // selamanya kalau server balikin error (mis. email/NIK/WA dobel).
      setSaving(false);
    }
  }

  async function toggleAktif(row) {
    await fetch('/api/admin/agen', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, aktif: row.status !== 'active' }),
    });
    muatData();
  }

  function mulaiEdit(row) {
    setEditingId(row.id);
    setEditNama(row.name); setEditWa(row.wa); setEditJk(row.jenis_kelamin || '');
  }

  async function simpanEdit(id) {
    if (!editNama.trim() || !editWa.trim() || !editJk) { alert('Nama, WA, dan jenis kelamin wajib diisi!'); return; }
    setSavingEdit(true);
    try {
      const res = await fetch('/api/admin/agen', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, edit: { nama: editNama.trim(), wa: editWa.trim(), jenis_kelamin: editJk } }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setSavingEdit(false); return; }
      setEditingId(null);
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setSavingEdit(false);
  }

  async function hapusAkun(row) {
    if (!confirm(`Hapus PERMANEN akun agen "${row.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      const res = await fetch(`/api/admin/agen?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
      muatData();
    } catch { alert('Terjadi kesalahan'); }
  }

  function salinLink(row) {
    const link = `${window.location.origin}/a/${row.kode_unik}`;
    navigator.clipboard.writeText(link).then(() => { setCopiedId(row.id); setTimeout(() => setCopiedId(null), 2000); });
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1";
  const inpErr = inp.replace('border-gray-200', 'border-red-400 bg-red-50');
  const c = (key) => fieldErr[key] ? inpErr : inp;
  const clearErr = (key) => { if (fieldErr[key]) setFieldErr(prev => ({ ...prev, [key]: false })); };

  return (
    <Layout title="🔗 Database Account Agen" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Akun ringan khusus buat ambil link referral pribadi — gak ada funnel pendaftaran, langsung aktif. Siapa pun yang buka link-nya diarahkan ke landing page dengan tombol WA diswitch ke nomor agen, dan booking yang masuk ke-tag otomatis. Riwayat closing & ujroh (Rp3,5jt/jamaah − voucher) ada di menu <b>Riwayat Closing</b> & <b>Pencairan Ujroh</b>.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Buat Akun Agen Baru</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={lbl}>Nama Lengkap *</label>
            <input value={nama} onChange={e => { setNama(e.target.value); clearErr('nama'); }} className={c('nama')} />
          </div>
          <div className="sm:col-span-2">
            <TempatLahirField value={tempatLahir} onChange={setTempatLahir} inp={inp} lbl={lbl} />
          </div>
          <div>
            <label className={lbl}>Email *</label>
            <input value={email} onChange={e => { setEmail(e.target.value); clearErr('email'); }} type="email" className={c('email')} />
          </div>
          <div>
            <label className={lbl}>No. WhatsApp</label>
            <input value={wa} onChange={e => { setWa(e.target.value.replace(/\D/g, '')); clearErr('wa'); }} placeholder="08xxxxxxxxxx (opsional)" inputMode="numeric" className={c('wa')} />
          </div>
          <div>
            {/* Dipakai nentuin sapaan "Ibu"/"Bapak" + nama di pesan WA
                otomatis pengunjung yang datang lewat link agen ini
                (dikonfirmasi user 2026-10-19). */}
            <label className={lbl}>Jenis Kelamin *</label>
            <select value={jk} onChange={e => { setJk(e.target.value); clearErr('jk'); }} className={c('jk')}>
              <option value="">— Pilih —</option>
              <option value="Laki-Laki">Laki-Laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Password Awal (min. 8 karakter) *</label>
            <input value={password} onChange={e => { setPassword(e.target.value); clearErr('password'); }} type="text" className={c('password')} />
          </div>
          <div>
            <label className={lbl}>NIK (16 digit) *</label>
            <input value={nik} onChange={e => { setNik(e.target.value.replace(/\D/g, '')); clearErr('nik'); }} maxLength={16} inputMode="numeric" className={c('nik')} />
          </div>
          <div>
            <label className={lbl}>Foto KTP</label>
            {fotoKtpPath ? (
              <div className="flex items-center gap-2">
                <a href={fotoKtpPath} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#1A4FA0] hover:underline">📎 Lihat foto</a>
                <button type="button" onClick={() => setFotoKtpPath('')} className="text-xs text-red-500 hover:underline">Hapus</button>
              </div>
            ) : (
              <input type="file" accept="image/jpeg,image/png,application/pdf" disabled={uploadingKtp}
                onChange={e => pilihFotoKtp(e.target.files?.[0])} className={inp} />
            )}
          </div>
          <div>
            <label className={lbl}>Nama Bank</label>
            <BankInput value={bank} onChange={setBank} placeholder="Opsional" className={inp} />
          </div>
          <div>
            <label className={lbl}>No. Rekening Ujroh</label>
            <input value={noRekening} onChange={e => setNoRekening(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Opsional" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Nama Pemilik Rekening</label>
            <input value={namaPemilikRekening} onChange={e => setNamaPemilikRekening(e.target.value)} placeholder="Opsional, default sama dengan Nama Lengkap" className={inp} />
          </div>
          <div className="sm:col-span-2">
            {/* Murni catatan "siapa yang bawa orang ini masuk" (dikonfirmasi
                user 2026-10-21) -- gak ngaruh ke komisi apa pun, beda dari
                perekrut_id perwakilan yang nentuin ujroh override. */}
            <label className={lbl}>Perekrut</label>
            <select value={perekrutId} onChange={e => { setPerekrutId(e.target.value); clearErr('perekrut_id'); }} className={c('perekrut_id')}>
              <option value="">— Tidak ada / tidak diketahui —</option>
              {perekrutOptions.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.role === 'agen' ? 'Agen' : o.role === 'super_admin' ? 'Super Admin' : 'Admin'})</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={buatAkun} disabled={saving}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
          {saving ? 'Membuat...' : '🔗 Buat Akun'}
        </button>
      </div>

      <div className="font-bold text-[#0E2F6E] mb-2">Daftar Akun Agen</div>
      {rows.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Belum ada akun agen.</div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className={`rounded-xl p-3 border ${r.status === 'active' ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
              {editingId === r.id ? (
                <div className="space-y-2">
                  <div className="grid sm:grid-cols-3 gap-2">
                    <input value={editNama} onChange={e => setEditNama(e.target.value)} placeholder="Nama" className={inp} />
                    <input value={editWa} onChange={e => setEditWa(e.target.value.replace(/\D/g, ''))} placeholder="No. WhatsApp" inputMode="numeric" className={inp} />
                    <select value={editJk} onChange={e => setEditJk(e.target.value)} className={inp}>
                      <option value="">— Jenis Kelamin —</option>
                      <option value="Laki-Laki">Laki-Laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => simpanEdit(r.id)} disabled={savingEdit}
                      className="text-xs font-bold text-white bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 px-3 py-1.5 rounded-full">
                      {savingEdit ? 'Menyimpan...' : 'Simpan'}
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={savingEdit}
                      className="text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full">
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-700">{r.name} <span className="text-gray-400 font-normal">· {r.kode_unik}</span></div>
                    <div className="text-xs text-gray-400">{r.wa}{r.jenis_kelamin ? ` · ${r.jenis_kelamin}` : ''} · Bergabung {tgl(r.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button onClick={() => salinLink(r)}
                      className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-blue-100 px-3 py-1.5 rounded-full">
                      {copiedId === r.id ? '✅ Tersalin' : '📋 Salin Link'}
                    </button>
                    <button onClick={() => mulaiEdit(r)}
                      className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full">
                      Edit
                    </button>
                    <button onClick={() => toggleAktif(r)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full ${r.status === 'active' ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                      {r.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button onClick={() => hapusAkun(r)}
                      className="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full">
                      Hapus
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
