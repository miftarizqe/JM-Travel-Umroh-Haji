'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import { useCurrentUser } from '@/lib/useCurrentUser';

function tglIndoSingkat(t) {
  return new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function programCustomKosong() {
  return {
    nama: '', jenis_program: '', durasi: 0, pax_jamaah: 0, pax_tl: 0, pax_mutawwif: 0,
    transportasi: '', haramain_express: '', city_tour: '',
    hotel: [{ lokasi: '', bintang: '', malam: '' }],
    itinerary: [],
    harga_mode: 'per_kamar', harga_quad: 0, harga_triple: 0, harga_double: 0, harga_semua: 0,
  };
}

export default function ProposalCorporatePage() {
  const router = useRouter();
  const [user] = useCurrentUser();
  const [daftar, setDaftar] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    nama_perusahaan: '', tujuan: '', alamat_perusahaan: '', nama_pic_perusahaan: '', kontak_pic_perusahaan: '',
    pic_kantor_nama: '', jabatan_pic_kantor: '', pic_kantor_kontak: '',
    kata_pengantar: 'Bersama surat ini, kami dari JM Travel bermaksud mengajukan proposal kerja sama untuk perjalanan Umroh & Haji bagi karyawan/anggota Bapak/Ibu.',
    program_ids: [],
    custom_programs: [],
  });

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') { router.replace('/admin?tab=dashboard'); }
  }, [user]);

  useEffect(() => {
    muat();
    // Sengaja gak difilter ke yang active/live-publish aja — proposal
    // corporate sering nawarin program yang baru disiapin costing-nya,
    // belum tentu udah dipublish buat booking publik.
    fetch('/api/admin/programs').then(r => r.json()).then(d => setPrograms(d.programs || []));
  }, []);

  function muat() {
    setLoading(true);
    fetch('/api/admin/proposal-corporate').then(r => r.json()).then(d => { setDaftar(d.proposal || []); setLoading(false); }).catch(() => setLoading(false));
  }

  function toggleProgram(id) {
    setForm(f => ({
      ...f,
      program_ids: f.program_ids.includes(id) ? f.program_ids.filter(x => x !== id) : [...f.program_ids, id],
    }));
  }

  function tambahProgramCustom() {
    setForm(f => ({ ...f, custom_programs: [...f.custom_programs, programCustomKosong()] }));
  }
  function hapusProgramCustom(i) {
    setForm(f => ({ ...f, custom_programs: f.custom_programs.filter((_, idx) => idx !== i) }));
  }
  function ubahProgramCustom(i, key, val) {
    setForm(f => ({
      ...f,
      custom_programs: f.custom_programs.map((p, idx) => {
        if (idx !== i) return p;
        const next = { ...p, [key]: val };
        // durasi berubah -> itinerary ikut nambah/kurang baris
        if (key === 'durasi') {
          const n = Math.max(0, Number(val) || 0);
          const arr = Array.from({ length: n }, (_, d) => p.itinerary[d] || '');
          next.itinerary = arr;
        }
        return next;
      }),
    }));
  }
  function ubahItineraryCustom(i, hari, val) {
    setForm(f => ({
      ...f,
      custom_programs: f.custom_programs.map((p, idx) => idx === i ? { ...p, itinerary: p.itinerary.map((h, d) => d === hari ? val : h) } : p),
    }));
  }
  function ubahHotelCustom(i, hi, key, val) {
    setForm(f => ({
      ...f,
      custom_programs: f.custom_programs.map((p, idx) => idx === i ? { ...p, hotel: p.hotel.map((h, hidx) => hidx === hi ? { ...h, [key]: val } : h) } : p),
    }));
  }
  function tambahHotelCustom(i) {
    setForm(f => ({ ...f, custom_programs: f.custom_programs.map((p, idx) => idx === i ? { ...p, hotel: [...p.hotel, { lokasi: '', bintang: '', malam: '' }] } : p) }));
  }
  function hapusHotelCustom(i, hi) {
    setForm(f => ({ ...f, custom_programs: f.custom_programs.map((p, idx) => idx === i ? { ...p, hotel: p.hotel.filter((_, hidx) => hidx !== hi) } : p) }));
  }

  async function submit() {
    if (!form.nama_perusahaan.trim()) { alert('Nama perusahaan wajib diisi'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposal-corporate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || 'Gagal membuat proposal'); setBusy(false); return; }
      window.open(`/admin/cetak-proposal/${d.id}`, '_blank');
      setShowForm(false);
      muat();
    } catch { alert('Terjadi kesalahan'); }
    setBusy(false);
  }

  async function hapus(id) {
    if (!confirm('Hapus proposal ini?')) return;
    const res = await fetch(`/api/admin/proposal-corporate/${id}`, { method: 'DELETE' });
    if (res.ok) muat();
  }

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const input = 'mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  const lbl = 'text-xs font-semibold text-gray-600';

  return (
    <Layout title="🤝 Proposal Corporate" backHref="/admin?tab=dashboard">
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="text-sm text-gray-500">Materi tawaran kerja sama ke calon corporate client — pengganti template Canva manual.</div>
        <div className="flex gap-2">
          <a href="/admin/pengaturan/proposal-profile" className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-4 py-2 rounded-xl">⚙️ Company Profile</a>
          <button onClick={() => setShowForm(s => !s)} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] text-white text-sm font-bold px-4 py-2 rounded-xl">
            {showForm ? 'Batal' : '+ Buat Proposal Baru'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={lbl}>Nama Perusahaan *
              <input value={form.nama_perusahaan} onChange={e => setForm(f => ({ ...f, nama_perusahaan: e.target.value }))} className={input} placeholder="Contoh: Asuransi Sinar Mas" />
            </label>
            <label className={lbl}>Tujuan / Occasion Proposal
              <input value={form.tujuan} onChange={e => setForm(f => ({ ...f, tujuan: e.target.value }))} className={input} placeholder="Contoh: Program Reward Perjalanan Wisata Karyawan" />
            </label>
            <label className={lbl}>Alamat Perusahaan
              <input value={form.alamat_perusahaan} onChange={e => setForm(f => ({ ...f, alamat_perusahaan: e.target.value }))} className={input} />
            </label>
            <label className={lbl}>Nama PIC Perusahaan
              <input value={form.nama_pic_perusahaan} onChange={e => setForm(f => ({ ...f, nama_pic_perusahaan: e.target.value }))} className={input} />
            </label>
            <label className={lbl}>Kontak PIC Perusahaan
              <input value={form.kontak_pic_perusahaan} onChange={e => setForm(f => ({ ...f, kontak_pic_perusahaan: e.target.value }))} className={input} placeholder="0812xxxxxxx / email" />
            </label>
            <label className={lbl}>PIC Kami yang Mengajukan
              <input value={form.pic_kantor_nama} onChange={e => setForm(f => ({ ...f, pic_kantor_nama: e.target.value }))} className={input} placeholder="Nama — bisa siapa saja dari kantor" />
            </label>
            <label className={lbl}>Jabatan PIC Kami
              <input value={form.jabatan_pic_kantor} onChange={e => setForm(f => ({ ...f, jabatan_pic_kantor: e.target.value }))} className={input} placeholder="Kosongkan = ikut default Pengaturan Umum" />
            </label>
            <label className={lbl}>Kontak PIC Kami
              <input value={form.pic_kantor_kontak} onChange={e => setForm(f => ({ ...f, pic_kantor_kontak: e.target.value }))} className={input} />
            </label>
          </div>

          <label className={`block ${lbl}`}>Kata Pengantar
            <textarea value={form.kata_pengantar} onChange={e => setForm(f => ({ ...f, kata_pengantar: e.target.value }))} rows={4} className={input} />
          </label>

          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">Program dari Katalog</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {programs.length === 0 && <div className="text-xs text-gray-400 col-span-2">Belum ada program aktif.</div>}
              {programs.map(p => (
                <label key={p.id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-50">
                  <input type="checkbox" checked={form.program_ids.includes(p.id)} onChange={() => toggleProgram(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-600">Program Custom (dibikin khusus buat proposal ini)</div>
              <button onClick={tambahProgramCustom} className="text-xs font-bold text-[#1A4FA0]">+ Tambah Program Custom</button>
            </div>
            <div className="space-y-4">
              {form.custom_programs.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-bold text-[#0E2F6E]">Program Custom #{i + 1}</div>
                    <button onClick={() => hapusProgramCustom(i)} className="text-red-500 text-xs font-bold">Hapus</button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    <input value={p.nama} onChange={e => ubahProgramCustom(i, 'nama', e.target.value)} placeholder="Nama Program" className="col-span-2 sm:col-span-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input value={p.jenis_program} onChange={e => ubahProgramCustom(i, 'jenis_program', e.target.value)} placeholder="Jenis Program" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="number" value={p.durasi} onChange={e => ubahProgramCustom(i, 'durasi', e.target.value)} placeholder="Total Hari" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="number" value={p.pax_jamaah} onChange={e => ubahProgramCustom(i, 'pax_jamaah', e.target.value)} placeholder="Pax Jamaah" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="number" value={p.pax_tl} onChange={e => ubahProgramCustom(i, 'pax_tl', e.target.value)} placeholder="Pax Tour Leader" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input type="number" value={p.pax_mutawwif} onChange={e => ubahProgramCustom(i, 'pax_mutawwif', e.target.value)} placeholder="Pax Mutawwif" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input value={p.transportasi} onChange={e => ubahProgramCustom(i, 'transportasi', e.target.value)} placeholder="Transportasi" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input value={p.haramain_express} onChange={e => ubahProgramCustom(i, 'haramain_express', e.target.value)} placeholder="Haramain Express" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <input value={p.city_tour} onChange={e => ubahProgramCustom(i, 'city_tour', e.target.value)} placeholder="City Tour" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  </div>

                  <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">Hotel</div>
                  <div className="space-y-1 mb-3">
                    {p.hotel.map((h, hi) => (
                      <div key={hi} className="flex gap-2">
                        <input value={h.lokasi} onChange={e => ubahHotelCustom(i, hi, 'lokasi', e.target.value)} placeholder="Lokasi (mis. Mekkah)" className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <input value={h.bintang} onChange={e => ubahHotelCustom(i, hi, 'bintang', e.target.value)} placeholder="Bintang" className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <input value={h.malam} onChange={e => ubahHotelCustom(i, hi, 'malam', e.target.value)} placeholder="Malam" className="w-20 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                        <button onClick={() => hapusHotelCustom(i, hi)} className="text-red-500 text-xs font-bold px-2">✕</button>
                      </div>
                    ))}
                    <button onClick={() => tambahHotelCustom(i)} className="text-xs font-bold text-[#1A4FA0]">+ Tambah Hotel</button>
                  </div>

                  {p.durasi > 0 && (
                    <>
                      <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">Itinerary per Hari</div>
                      <div className="space-y-1 mb-3">
                        {p.itinerary.map((teks, hari) => (
                          <textarea key={hari} value={teks} onChange={e => ubahItineraryCustom(i, hari, e.target.value)} rows={2}
                            placeholder={`Hari ${hari + 1}...`} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs" />
                        ))}
                      </div>
                    </>
                  )}

                  <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">Harga Jual</div>
                  <div className="flex items-center gap-3 mb-2 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={p.harga_mode === 'per_kamar'} onChange={() => ubahProgramCustom(i, 'harga_mode', 'per_kamar')} /> Per tipe kamar
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={p.harga_mode === 'semua_kamar'} onChange={() => ubahProgramCustom(i, 'harga_mode', 'semua_kamar')} /> Sama semua kamar
                    </label>
                  </div>
                  {p.harga_mode === 'per_kamar' ? (
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" value={p.harga_quad} onChange={e => ubahProgramCustom(i, 'harga_quad', e.target.value)} placeholder="Harga Quad" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                      <input type="number" value={p.harga_triple} onChange={e => ubahProgramCustom(i, 'harga_triple', e.target.value)} placeholder="Harga Triple" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                      <input type="number" value={p.harga_double} onChange={e => ubahProgramCustom(i, 'harga_double', e.target.value)} placeholder="Harga Double" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                  ) : (
                    <input type="number" value={p.harga_semua} onChange={e => ubahProgramCustom(i, 'harga_semua', e.target.value)} placeholder="Harga (semua tipe kamar)" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <button onClick={submit} disabled={busy} className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl">
            {busy ? 'Menyimpan...' : 'Buat & Buka Preview Cetak'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : daftar.length === 0 ? (
        <div className="text-center text-gray-400 py-10 text-sm">Belum ada proposal dibuat.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {daftar.map(p => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-semibold text-sm text-[#0E2F6E]">{p.nama_perusahaan}</div>
                <div className="text-xs text-gray-400">{p.nomor_proposal} · PIC {p.nama_pic_perusahaan || '-'} · {tglIndoSingkat(p.created_at)}</div>
              </div>
              <div className="flex gap-2">
                <a href={`/admin/cetak-proposal/${p.id}`} target="_blank" rel="noopener noreferrer"
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-lg">🖨️ Cetak</a>
                <button onClick={() => hapus(p.id)} className="text-red-500 text-xs font-bold px-2">Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
