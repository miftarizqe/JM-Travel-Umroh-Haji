'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// "Database Account" agen — login minimal cuma buat ambil link referral
// pribadi, gak ada funnel pendaftaran/dashboard (dikonfirmasi user
// 2026-10-17). Admin bikin akun langsung di sini (nama/NIK/email/WA/
// password), kode referral & link kebuat otomatis. Riwayat closing & komisi
// (yang sekarang beneran tercatat di komisi_ledger) pindah ke halaman
// Riwayat Closing & Pencairan Komisi masing-masing, bukan di sini lagi.
export default function AdminAgenPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nama, setNama] = useState('');
  const [nik, setNik] = useState('');
  const [email, setEmail] = useState('');
  const [wa, setWa] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  function muatData() {
    fetch('/api/admin/agen')
      .then(r => r.json())
      .then(d => { setRows(d.agen || []); setLoading(false); })
      .catch(() => setLoading(false));
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
    if (!nama.trim() || !nik.trim() || !email.trim() || !wa.trim() || !password.trim()) {
      alert('Semua field wajib diisi!'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/agen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: nama.trim(), nik: nik.trim(), email: email.trim(), wa: wa.trim(), password: password.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat akun'); return; }
      alert(`Akun agen "${nama}" dibuat. Kode: ${d.kode_unik}. Sampaikan email+password ini ke yang bersangkutan buat login.`);
      setNama(''); setNik(''); setEmail(''); setWa(''); setPassword('');
      muatData();
    } catch { alert('Terjadi kesalahan'); }
    setSaving(false);
  }

  async function toggleAktif(row) {
    await fetch('/api/admin/agen', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, aktif: row.status !== 'active' }),
    });
    muatData();
  }

  function salinLink(row) {
    const link = `${window.location.origin}/a/${row.kode_unik}`;
    navigator.clipboard.writeText(link).then(() => { setCopiedId(row.id); setTimeout(() => setCopiedId(null), 2000); });
  }

  const inp = "w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <Layout title="🔗 Database Account Agen" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Akun ringan khusus buat ambil link referral pribadi — gak ada funnel pendaftaran, langsung aktif. Siapa pun yang buka link-nya diarahkan ke landing page dengan tombol WA diswitch ke nomor agen, dan booking yang masuk ke-tag otomatis. Riwayat closing & komisi (Rp3,5jt/jamaah − voucher) ada di menu <b>Riwayat Closing</b> & <b>Pencairan Komisi</b>.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="font-bold text-[#0E2F6E] mb-3">➕ Buat Akun Agen Baru</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={lbl}>Nama Lengkap *</label>
            <input value={nama} onChange={e => setNama(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>NIK (16 digit) *</label>
            <input value={nik} onChange={e => setNik(e.target.value.replace(/\D/g, ''))} maxLength={16} inputMode="numeric" className={inp} />
          </div>
          <div>
            <label className={lbl}>Email *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inp} />
          </div>
          <div>
            <label className={lbl}>No. WhatsApp *</label>
            <input value={wa} onChange={e => setWa(e.target.value.replace(/\D/g, ''))} placeholder="08xxxxxxxxxx" inputMode="numeric" className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Password Awal (min. 8 karakter) *</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="text" className={inp} />
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
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-700">{r.name} <span className="text-gray-400 font-normal">· {r.kode_unik}</span></div>
                  <div className="text-xs text-gray-400">{r.wa} · Bergabung {tgl(r.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => salinLink(r)}
                    className="text-xs font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-blue-100 px-3 py-1.5 rounded-full">
                    {copiedId === r.id ? '✅ Tersalin' : '📋 Salin Link'}
                  </button>
                  <button onClick={() => toggleAktif(r)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full ${r.status === 'active' ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                    {r.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
