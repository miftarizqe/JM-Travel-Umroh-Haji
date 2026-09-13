'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import SearchableSelect from '@/app/components/SearchableSelect';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useIsHop } from '@/lib/useIsHop';

const TEKS_KONFIRMASI = 'UBAH NOMINAL';

// Modal konfirmasi ketik-ulang — dikonfirmasi user 2026-08-29: nominal komisi
// Sahabat Baitullah itu "angka fatal", gak boleh gampang keubah/ke-klik gak
// sengaja. Cuma dipakai di halaman ini (1 pemakai), jadi inline aja, gak
// perlu jadi komponen shared dulu.
function ModalKonfirmasi({ judul, ringkasan, onBatal, onKonfirmasi, saving }) {
  const [teks, setTeks] = useState('');
  const cocok = teks.trim() === TEKS_KONFIRMASI;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onBatal}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="font-bold text-lg text-[#0E2F6E] mb-1">⚠️ Konfirmasi Perubahan Nominal</div>
        <div className="text-sm text-gray-500 mb-4">{judul}</div>
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mb-4 space-y-1">{ringkasan}</div>
        <div className="text-xs text-gray-500 mb-1.5">
          Ketik <b className="text-red-600">{TEKS_KONFIRMASI}</b> buat lanjut simpan:
        </div>
        <input value={teks} onChange={e => setTeks(e.target.value)} autoFocus
          className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:outline-none text-sm mb-4" />
        <div className="flex gap-2">
          <button onClick={onBatal} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-xl">Batal</button>
          <button onClick={onKonfirmasi} disabled={!cocok || saving}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl">
            {saving ? 'Menyimpan...' : 'Konfirmasi & Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtRp(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

export default function PengaturanKomisiSahabatBaitullahPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const { isHop, checked: hopChecked } = useIsHop(user);
  // Halaman ini SEBELUMNYA super_admin-only (bukan admin biasa) — jangan
  // dilebarin ke seluruh 'admin' kayak halaman Sahabat lain, HOP itu
  // pengecualian TAMBAHAN yang eksplisit dikonfirmasi user 2026-09-07,
  // bukan pelonggaran umum jadi isAdminOrHop.
  const canView = !!user && (user.role === 'super_admin' || isHop);
  const [adminList, setAdminList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(null); // 'sahabat' | null

  const [sahabat, setSahabat] = useState({
    gen1: '0', gen2: '0', gen3: '0', gen4: '0', gen5: '0',
    tabunganAwal: '0', hopNominal: '0', hopUserId: '',
  });

  useEffect(() => {
    if (!user || !hopChecked) return;
    // super_admin lewat endpoint asli (buat konsistensi sama form Simpan di
    // bawah, yang PUT-nya juga cuma boleh super_admin); admin biasa & HOP
    // (dikonfirmasi user 2026-09-07, HOP boleh liat nominal ini read-only)
    // lewat endpoint scoped baru yang gak bocorin setting app-wide lain.
    if (!canView) { router.replace('/admin/sahabat'); return; }
    const endpoint = user.role === 'super_admin' ? '/api/admin/pengaturan' : '/api/admin/sahabat/pengaturan-komisi';
    fetch(endpoint).then(r => r.json()).then(d => {
      const p = d.pengaturan || {};
      setSahabat({
        gen1: String(p.sahabat_gen1_nominal || 0), gen2: String(p.sahabat_gen2_nominal || 0),
        gen3: String(p.sahabat_gen3_nominal || 0), gen4: String(p.sahabat_gen4_nominal || 0),
        gen5: String(p.sahabat_gen5_nominal || 0), tabunganAwal: String(p.sahabat_tabungan_awal_nominal || 0),
        hopNominal: String(p.sahabat_head_of_program_nominal || 0), hopUserId: p.head_of_program_user_id || '',
      });
    }).catch(() => {});
    fetch('/api/admin/sahabat/admins').then(r => r.json()).then(d => setAdminList(d.admins || [])).catch(() => {});
  }, [user, hopChecked, canView]);

  async function simpan(body) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pengaturan', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error); setSaving(false); return; }
      setKonfirmasi(null);
    } catch { alert('Gagal menyimpan'); }
    setSaving(false);
  }

  if (!user || !hopChecked || !canView) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const namaHop = adminList.find(a => a.id === sahabat.hopUserId)?.name || '(belum dipilih)';

  return (
    <Layout title="🔒 Pengaturan Komisi Sahabat Baitullah" backHref="/admin/sahabat">
      <div className="text-xs text-gray-400 mb-4">
        Nominal &amp; persentase di halaman ini langsung memengaruhi berapa yang diterima tiap Jamaah Sahabat Baitullah &amp; Head of Program — sengaja dipindah ke halaman terpisah, super_admin only, dan wajib konfirmasi sebelum tersimpan.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="font-bold text-[#0E2F6E] mb-1">📿 Ujroh 5 Generasi — Sahabat Baitullah</div>
        <div className="text-xs text-gray-400 mb-3">Dibayar otomatis ke atas rantai perekrut begitu jemaah baru aktif — Gen1 = perekrut langsung, Gen2 = perekrutnya perekrut, dst.</div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {['gen1', 'gen2', 'gen3', 'gen4', 'gen5'].map((k, i) => (
            <div key={k}>
              <label className="block text-[10px] font-semibold text-gray-500 mb-1">Gen{i + 1} (Rp)</label>
              <input type="number" value={sahabat[k]} onChange={e => setSahabat(s => ({ ...s, [k]: e.target.value }))}
                disabled={isHop} readOnly={isHop}
                className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tabungan Awal Jemaah Baru (Rp)</label>
            <input type="number" value={sahabat.tabunganAwal} onChange={e => setSahabat(s => ({ ...s, tabunganAwal: e.target.value }))}
              disabled={isHop} readOnly={isHop}
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm disabled:bg-gray-50 disabled:text-gray-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Head of Program — per Registrasi (Rp)</label>
            <input type="number" value={sahabat.hopNominal} onChange={e => setSahabat(s => ({ ...s, hopNominal: e.target.value }))}
              disabled={isHop} readOnly={isHop}
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm disabled:bg-gray-50 disabled:text-gray-500" />
          </div>
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Akun Head of Program</label>
          {isHop ? (
            <div className="w-full px-3 py-2 rounded-lg border-2 border-gray-100 bg-gray-50 text-sm text-gray-600">{namaHop}</div>
          ) : (
            <SearchableSelect
              value={sahabat.hopUserId}
              onChange={v => setSahabat(s => ({ ...s, hopUserId: v }))}
              placeholder="Ketik buat cari nama Jamaah Sahabat Baitullah..."
              options={adminList.map(a => ({ value: a.id, label: `${a.name} (${a.kode_unik || '-'})` }))}
            />
          )}
          {/* WAJIB akun role sahabat_baitullah aktif (dikonfirmasi user
              2026-09-07, dulu wajib akun staff admin) — daftarnya dari
              /api/admin/sahabat/admins yang query-nya udah disesuaikan. */}
          <div className="text-[10px] text-gray-400 mt-1">Wajib akun Jamaah Sahabat Baitullah aktif (bukan staff). Dapat komisi 2x: tiap ada jemaah baru aktif (nominal di atas), DAN dari closing langsung (persen checkout diri sendiri & nominal fix closing-in jamaah lain, dua-duanya diatur per-program di Costing Program). Sebagai HOP, dia juga bisa lihat SELURUH jaringan Sahabat Baitullah dari dashboard akunnya sendiri (bukan cuma downline dia).</div>
        </div>
        {!isHop && (
          <button onClick={() => setKonfirmasi('sahabat')}
            className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            Simpan
          </button>
        )}
        {isHop && (
          <div className="text-[10px] text-gray-400">Lihat saja — hanya super_admin yang bisa mengubah nominal ini.</div>
        )}
      </div>

      {/* Card "Closing Langsung" (persen checkout diri sendiri) DIHAPUS dari
          sini (dikonfirmasi user 2026-09-06) — pindah jadi field per-program
          di Costing Program (admin/programs), publish_type='sahabat_baitullah',
          mirror nominal fix Head of Program yang udah pindah duluan. */}

      {konfirmasi === 'sahabat' && (
        <ModalKonfirmasi
          judul="Ujroh 5 Generasi & Head of Program"
          saving={saving}
          onBatal={() => setKonfirmasi(null)}
          onKonfirmasi={() => simpan({
            sahabat_gen1_nominal: sahabat.gen1, sahabat_gen2_nominal: sahabat.gen2, sahabat_gen3_nominal: sahabat.gen3,
            sahabat_gen4_nominal: sahabat.gen4, sahabat_gen5_nominal: sahabat.gen5,
            sahabat_tabungan_awal_nominal: sahabat.tabunganAwal, sahabat_head_of_program_nominal: sahabat.hopNominal,
            head_of_program_user_id: sahabat.hopUserId || null,
          })}
          ringkasan={
            <>
              <div>Gen1-5: {fmtRp(sahabat.gen1)} / {fmtRp(sahabat.gen2)} / {fmtRp(sahabat.gen3)} / {fmtRp(sahabat.gen4)} / {fmtRp(sahabat.gen5)}</div>
              <div>Tabungan Awal: {fmtRp(sahabat.tabunganAwal)}</div>
              <div>Head of Program (registrasi): {fmtRp(sahabat.hopNominal)}</div>
              <div>Akun Head of Program: {namaHop}</div>
            </>
          }
        />
      )}
    </Layout>
  );
}
