'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';
import SearchableSelect from '@/app/components/SearchableSelect';

let idCounter = 0;

const JENIS_LIST = [
  { key: 'pks', label: 'SPKA-Ins', uploadUrl: '/api/admin/upload-dokumen-pks-fisik', contoh: 'SPKAINS' },
  { key: 'formulir', label: 'Formulir Pendaftaran', uploadUrl: '/api/admin/upload-formulir-fisik', contoh: 'FORMULIR' },
  { key: 'ktp', label: 'Foto KTP', uploadUrl: '/api/admin/upload-ktp-fisik', contoh: 'KTP' },
  { key: 'foto', label: 'Foto Profil', uploadUrl: '/api/admin/upload-foto-profil', contoh: 'FOTO' },
];

export default function AdminDokumenFisikPage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [jenis, setJenis] = useState('pks');
  const [rows, setRows] = useState([]); // { id, file, userId, uploadUrl, jenisLabel, status: 'pending'|'uploading'|'sukses'|'gagal', pesan }
  const [uploadingAll, setUploadingAll] = useState(false);

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { setUsers((d.users || []).filter(u => u.role === 'perwakilan')); setLoadingUsers(false); })
      .catch(() => setLoadingUsers(false));
  }, [user]);

  if (!user || !['admin','super_admin'].includes(user.role) || loadingUsers) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const userOptions = users.map(u => ({
    value: u.id,
    label: `${u.name} · ${u.kode_unik || '-'}${u.nik ? ' · NIK ' + u.nik : ''}`,
  }));

  // Auto-cocokkan file ke perwakilan kalau nama filenya mengandung
  // kode_unik yang bersangkutan (mis. "KTP_AJM0103_INDRA-KUSUMA.jpg") —
  // hemat waktu buat batch besar, tapi tetap bisa dikoreksi manual lewat
  // SearchableSelect kalau salah tebak.
  // Match HARUS dibatasi non-alfanumerik di kedua sisi (bukan substring
  // bebas) — beberapa kode_unik di data nyata adalah prefix kode lain
  // (mis. "AJM0010" adalah awalan dari "AJM00106"), substring polos bisa
  // salah cocok ke perwakilan yang beda.
  function cariUserDariNamaFile(filename) {
    const upper = filename.toUpperCase();
    return users.find(u => {
      if (!u.kode_unik) return false;
      const kode = u.kode_unik.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^A-Z0-9])${kode}([^A-Z0-9]|$)`).test(upper);
    });
  }

  function tambahFile(fileList) {
    const dok = JENIS_LIST.find(j => j.key === jenis);
    const baru = Array.from(fileList).map(file => {
      const matched = cariUserDariNamaFile(file.name);
      return {
        id: ++idCounter, file, userId: matched?.id || '', uploadUrl: dok.uploadUrl, jenisLabel: dok.label,
        status: 'pending', pesan: '', autoMatched: !!matched,
      };
    });
    setRows(r => [...r, ...baru]);
  }

  function hapusRow(id) {
    setRows(r => r.filter(row => row.id !== id));
  }

  function cocokkanUser(id, userId) {
    setRows(r => r.map(row => row.id === id ? { ...row, userId, autoMatched: false } : row));
  }

  async function simpanSemua() {
    const siap = rows.filter(r => r.userId && (r.status === 'pending' || r.status === 'gagal'));
    if (siap.length === 0) { alert('Belum ada file yang dicocokkan ke perwakilan.'); return; }
    setUploadingAll(true);
    for (const row of siap) {
      setRows(r => r.map(x => x.id === row.id ? { ...x, status: 'uploading' } : x));
      try {
        const fd = new FormData();
        fd.append('file', row.file);
        fd.append('user_id', row.userId);
        const res = await fetch(row.uploadUrl, { method: 'POST', body: fd });
        const d = await res.json();
        setRows(r => r.map(x => x.id === row.id ? { ...x, status: res.ok ? 'sukses' : 'gagal', pesan: res.ok ? '' : (d.error || 'Gagal') } : x));
      } catch {
        setRows(r => r.map(x => x.id === row.id ? { ...x, status: 'gagal', pesan: 'Terjadi kesalahan jaringan' } : x));
      }
    }
    setUploadingAll(false);
  }

  const jumlahSukses = rows.filter(r => r.status === 'sukses').length;
  const jumlahGagal = rows.filter(r => r.status === 'gagal').length;
  const jumlahSiap = rows.filter(r => r.userId && (r.status === 'pending' || r.status === 'gagal')).length;

  return (
    <Layout title="📤 Import Dokumen Fisik" backHref="/admin/pengaturan/dokumen">
      <div className="text-xs text-gray-400 mb-4">
        Upload banyak scan/foto dokumen yang sudah ditandatangani sekaligus — cocokkan tiap file ke perwakilan yang bersangkutan, baru simpan semua. Buat upload satu-satu per orang, ada juga di halaman cetak masing-masing (Database → klik nomor surat).
        <br />
        <span className="text-gray-500">💡 Tips: kalau nama file mengandung kode unik perwakilannya (mis. <code className="bg-gray-100 px-1 rounded">{JENIS_LIST.find(j => j.key === jenis)?.contoh}_AJM0103_INDRA-KUSUMA.jpg</code>), sistem otomatis nyocokkan — tinggal dicek, gak perlu cari manual.</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {JENIS_LIST.map(d => (
          <button key={d.key} onClick={() => setJenis(d.key)}
            className={`text-xs font-bold px-4 py-2 rounded-full whitespace-nowrap ${jenis === d.key ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <label className="inline-block text-sm font-bold text-[#1A4FA0] bg-[#E8F0FB] hover:bg-[#d5e4f8] px-4 py-2.5 rounded-full cursor-pointer">
          + Pilih File {JENIS_LIST.find(j => j.key === jenis)?.label} (bisa lebih dari satu)
          <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="hidden"
            onChange={e => { tambahFile(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {rows.length > 0 && (
        <>
          <div className="space-y-2 mb-4">
            {rows.map(row => (
              <div key={row.id} className={`rounded-xl border p-3 flex items-center gap-3 ${row.autoMatched ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-700 truncate">{row.file.name}</div>
                  <div className="text-xs text-gray-400">{row.jenisLabel} · {(row.file.size / 1024).toFixed(0)} KB</div>
                </div>
                <div className="w-64 shrink-0">
                  {row.autoMatched && <div className="text-[10px] font-bold text-green-600 mb-0.5">✨ Auto-cocok dari nama file — cek dulu ya</div>}
                  <SearchableSelect
                    value={row.userId}
                    onChange={v => cocokkanUser(row.id, v)}
                    options={userOptions}
                    placeholder="Cari nama/kode/NIK..."
                  />
                </div>
                <div className="w-28 shrink-0 text-xs font-bold text-center">
                  {row.status === 'pending' && <span className="text-gray-400">Menunggu</span>}
                  {row.status === 'uploading' && <span className="text-[#1A4FA0]">Mengunggah...</span>}
                  {row.status === 'sukses' && <span className="text-green-600">✅ Tersimpan</span>}
                  {row.status === 'gagal' && <span className="text-red-500" title={row.pesan}>❌ Gagal</span>}
                </div>
                <button onClick={() => hapusRow(row.id)} disabled={row.status === 'uploading'}
                  className="text-gray-300 hover:text-red-500 disabled:opacity-30 shrink-0">🗑️</button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={simpanSemua} disabled={uploadingAll || jumlahSiap === 0}
              className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
              {uploadingAll ? 'Menyimpan...' : `💾 Simpan Semua (${jumlahSiap})`}
            </button>
            {(jumlahSukses > 0 || jumlahGagal > 0) && (
              <span className="text-sm text-gray-500">
                {jumlahSukses > 0 && <span className="text-green-600 font-semibold">{jumlahSukses} berhasil</span>}
                {jumlahSukses > 0 && jumlahGagal > 0 && ' · '}
                {jumlahGagal > 0 && <span className="text-red-500 font-semibold">{jumlahGagal} gagal</span>}
              </span>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
