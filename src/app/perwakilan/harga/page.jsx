'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const PAKET = ['deluxe', 'eksekutif', 'signature'];
const KAMAR = ['quad', 'triple', 'double'];
const PAKET_LABEL = { deluxe: 'Deluxe', eksekutif: 'Eksekutif', signature: 'Signature' };
const KAMAR_LABEL = { quad: 'Quad (4/kamar)', triple: 'Triple (3/kamar)', double: 'Double (2/kamar)' };

export default function AturHargaPerwakilan() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [programs, setPrograms] = useState([]);
  const [upline, setUpline] = useState(null);
  const [selected, setSelected] = useState(null); // prog_id yang sedang dilihat
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [openForm, setOpenForm] = useState(null); // key `${paket}_${kamar}` yang sedang diajukan
  const [formHarga, setFormHarga] = useState('');
  const [formAlasan, setFormAlasan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadRequests() {
    fetch(`/api/custom-harga?pengaju_id=${user.id}`)
      .then(r => r.json())
      .then(d => setRequests(d.requests || []))
      .catch(() => {});
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'perwakilan') { router.push('/dashboard/jamaah'); return; }
    fetch(`/api/perwakilan/harga?perw_id=${user.id}`)
      .then(r => r.json())
      .then(d => { setPrograms(d.programs || []); setUpline(d.upline || null); setLoading(false); })
      .catch(() => setLoading(false));
    loadRequests();
  }, [user]);

  // Pengajuan pending terakhir untuk 1 kombinasi program+paket+kamar —
  // dipakai untuk kunci tombol ajukan ulang selagi masih diproses admin.
  function pendingUntuk(progId, paket, kamar) {
    return requests.find(r => r.prog_id === progId && r.paket === paket && r.kamar === kamar && r.status === 'pending');
  }

  async function ajukanHarga(progId, paket, kamar) {
    if (!formHarga || Number(formHarga) <= 0) { alert('Harga yang diajukan wajib diisi!'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/custom-harga', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pengaju_id: user.id, prog_id: progId, paket, kamar,
          harga_diajukan: Number(formHarga), alasan: formAlasan || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal mengirim pengajuan'); return; }
      alert(d.message);
      setOpenForm(null); setFormHarga(''); setFormAlasan('');
      loadRequests();
    } catch { alert('Terjadi kesalahan'); }
    setSubmitting(false);
  }

  if (!user || loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  const prog = programs.find(p => p.prog_id === selected);

  return (
    <Layout title="💰 Harga Jual">
      <div className="max-w-3xl mx-auto">

        {/* Info skema */}
        <div className="bg-[#E8F0FB] rounded-xl p-4 mb-6 text-sm text-[#1A4FA0]">
          <div className="font-bold mb-1">💡 Harga diatur oleh admin</div>
          <div className="opacity-90">Harga jual & HPP Anda sekarang ditentukan oleh admin JM Travel — hubungi admin kalau ada yang perlu diubah.</div>
          {upline && (
            <div className="opacity-90 mt-1">
              Anda direkrut oleh <strong>{upline.name} ({upline.kode_unik})</strong> — HPP Anda mengikuti harga reseller yang dipasang admin untuk upline Anda.
            </div>
          )}
        </div>

        {/* Kalkulator Perwakilan — pintu masuk dari sini (bukan bottom-nav
            tersendiri, biar navbar mobile gak kepenuhan) karena tematiknya
            sama-sama soal harga. Eksplorasi kombinasi hotel/rute/dll + margin
            sendiri, beda dari harga flat per-program di atas. */}
        <button onClick={() => router.push('/perwakilan/kalkulator')}
          className="w-full flex items-center justify-between bg-white rounded-xl border-2 border-[#C9952A] p-4 mb-6 hover:bg-[#FEF3DC] transition-colors">
          <div className="text-left">
            <div className="font-bold text-[#0E2F6E]">🧮 Kalkulator Perwakilan</div>
            <div className="text-xs text-gray-500 mt-0.5">Eksplorasi harga sendiri (hotel/rute/malam/dll), simpan buat quote ke jamaah, atau ajukan ke admin</div>
          </div>
          <span className="text-[#C9952A] text-xl">→</span>
        </button>

        {/* Daftar program */}
        {!selected && (
          <div className="space-y-3">
            <div className="font-bold text-[#0E2F6E] mb-1">Program</div>
            {programs.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e0e8f0] p-6 text-center text-sm text-gray-400">
                Belum ada program tersedia.
              </div>
            ) : programs.map(p => (
              <div key={p.prog_id}
                className="bg-white rounded-xl border border-[#e0e8f0] p-4 flex items-center justify-between hover:border-[#1A4FA0] hover:shadow-md transition-all cursor-pointer"
                onClick={() => setSelected(p.prog_id)}>
                <div>
                  <div className="font-bold text-[#0E2F6E]">{p.prog_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">HPP berbeda per paket & kamar</div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    p.sudah_diatur ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.sudah_diatur ? '✅ Sudah diatur' : '⚙️ Belum diatur admin'}
                  </span>
                  <div className="text-xs text-[#1A4FA0] font-bold mt-1">Lihat →</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail harga per program — read-only */}
        {selected && prog && (
          <div>
            <button onClick={() => setSelected(null)}
              className="text-sm text-gray-500 mb-4 hover:text-[#1A4FA0]">← Kembali ke daftar program</button>

            <div className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
              <div className="font-bold text-[#0E2F6E] text-lg">{prog.prog_name}</div>
              <div className="text-sm text-gray-400 mt-0.5">Harga & HPP ditetapkan admin</div>
            </div>

            {PAKET.map(paket => (
              <div key={paket} className="bg-white rounded-xl border border-[#e0e8f0] p-5 mb-4">
                <div className="font-bold text-[#0E2F6E] mb-3">📦 Paket {PAKET_LABEL[paket]}</div>
                <div className="space-y-3">
                  {KAMAR.map(kamar => {
                    const key = `${paket}_${kamar}`;
                    const hargaJual = (prog.jual && prog.jual[key]) || 0;
                    const hppKombinasi = (prog.hpp && prog.hpp[key]) || 0;
                    const sumberHpp = (prog.hpp_source && prog.hpp_source[key]) || 'kantor';
                    const ujroh = hargaJual - hppKombinasi;
                    const pending = pendingUntuk(prog.prog_id, paket, kamar);
                    const formKey = `${prog.prog_id}_${key}`;
                    return (
                      <div key={kamar} className="border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-4 text-sm text-gray-600">
                            {KAMAR_LABEL[kamar]}
                            <div className="text-[10px] text-gray-400">
                              HPP {rp(hppKombinasi)} {sumberHpp === 'upline' ? `(dari ${upline?.name || 'upline'})` : '(dari kantor)'}
                            </div>
                          </div>
                          <div className="col-span-4 text-sm text-gray-600">
                            Harga jual: <span className="font-bold text-[#0E2F6E]">{rp(hargaJual)}</span>
                          </div>
                          <div className="col-span-4 text-right">
                            <div className="text-[10px] text-gray-400">Ujroh Anda</div>
                            <div className={`text-xs font-bold ${ujroh > 0 ? 'text-green-600' : ujroh < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {rp(ujroh)}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-1">
                          {pending ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                              ⏳ Menunggu approval: {rp(pending.harga_diajukan)}
                            </span>
                          ) : openForm === formKey ? (
                            <div className="w-full bg-gray-50 rounded-lg p-3 mt-1 space-y-2">
                              <input type="number" value={formHarga} onChange={e => setFormHarga(e.target.value)}
                                placeholder="Harga jual yang diajukan"
                                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
                              <input value={formAlasan} onChange={e => setFormAlasan(e.target.value)}
                                placeholder="Alasan (opsional)"
                                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-[#1A4FA0] focus:outline-none text-sm"/>
                              <div className="flex gap-2">
                                <button onClick={() => { setOpenForm(null); setFormHarga(''); setFormAlasan(''); }}
                                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold py-2 rounded-full">Batal</button>
                                <button onClick={() => ajukanHarga(prog.prog_id, paket, kamar)} disabled={submitting}
                                  className="flex-1 bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-xs font-bold py-2 rounded-full disabled:opacity-50">
                                  {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setOpenForm(formKey); setFormHarga(String(hargaJual || '')); setFormAlasan(''); }}
                              className="text-[10px] font-bold text-[#1A4FA0] underline">
                              🙋 Ajukan Harga Lain
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
