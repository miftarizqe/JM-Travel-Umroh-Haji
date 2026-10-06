'use client';
import { useEffect, useState } from 'react';

// Dipakai berulang di form-form yang butuh alamat lengkap (KTP, domisili,
// pengiriman, dst) — daripada duplikasi 10 input manual per varian. `suffix`
// nge-namespace field state-nya (mis. '' utk KTP, '_dom' utk domisili,
// '_kirim' utk pengiriman) supaya beberapa alamat bisa hidup di 1 form state
// tanpa tabrakan nama.

// No. Rumah/RT/RW/Kode Pos cuma digit — disaring PAS NGETIK (bukan cuma pas
// submit), soalnya field bebas teks sebelumnya nerima apa aja ("23fdfdfd",
// dst, ditemukan user 2026-10-06). Batas digit ikut aturan RT/RW/kode pos
// Indonesia (RT/RW 1-4 digit, kode pos 5-6 digit) + No. Rumah dikasih
// kelonggaran sampai 5 digit (nomor rumah/blok yang gak sekadar 1-3 digit).
function onlyDigits(v, max) {
  return v.replace(/\D/g, '').slice(0, max);
}

function findIdByName(opts, name) {
  if (!name) return '';
  return opts.find(o => o.name.toLowerCase() === name.toLowerCase())?.id || '';
}

// Provinsi/Kota/Kecamatan/Kelurahan sekarang dropdown berjenjang (dikonfirmasi
// user 2026-10-06, sebelumnya 4 text bebas — typo & ejaan gak konsisten).
// Nilai yang kesimpen di form TETAP nama (string), bukan id — kolom DB-nya
// varchar lama, gak perlu migrasi. Id cuma dipakai LOKAL di komponen ini
// buat nentuin request level berikutnya (lihat /api/wilayah).
function useWilayahOptions(level, parentId) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  // 'provinsi' gak butuh parent; level lain nunggu parentId keisi dulu —
  // dicek di sini (bukan setOptions([]) langsung di body effect) biar gak
  // ada setState sinkron di luar callback promise.
  const active = level === 'provinsi' || !!parentId;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    const qs = level === 'provinsi' ? '' : `&parent_id=${parentId}`;
    fetch(`/api/wilayah?level=${level}${qs}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setOptions(d.items || []); })
      .catch(() => { if (!cancelled) setOptions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [level, parentId, active]);

  return { options: active ? options : [], loading: active && loading };
}

export function AddressFields({ form, setF, suffix, inp, lbl }) {
  const k = (name) => `${name}${suffix}`;

  // null = belum dipilih manual, turunin dari NAMA yang udah kesimpen di
  // form (dikonfirmasi user 2026-10-06) — dihitung pas render, BUKAN lewat
  // effect, biar tombol "Kembali" di wizard pendaftaran gak bikin dropdown
  // kebawahnya kosong lagi tanpa nambah state-in-effect. String kosong ''
  // (beda dari null) berarti "sengaja dikosongin pas ganti leluhurnya".
  const [provinsiIdSel, setProvinsiIdSel] = useState(null);
  const [kotaIdSel, setKotaIdSel] = useState(null);
  const [kecIdSel, setKecIdSel] = useState(null);

  const { options: provinsiOpt } = useWilayahOptions('provinsi', null);
  const provinsiId = provinsiIdSel ?? findIdByName(provinsiOpt, form[k('provinsi')]);

  const { options: kotaOpt, loading: loadingKota } = useWilayahOptions('kota', provinsiId);
  const kotaId = kotaIdSel ?? findIdByName(kotaOpt, form[k('kota')]);

  const { options: kecOpt, loading: loadingKec } = useWilayahOptions('kec', kotaId);
  const kecId = kecIdSel ?? findIdByName(kecOpt, form[k('kec')]);

  const { options: kelOpt, loading: loadingKel } = useWilayahOptions('kel', kecId);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Provinsi *</label>
          <select value={provinsiId} onChange={e => {
            const id = e.target.value;
            setProvinsiIdSel(id); setKotaIdSel(''); setKecIdSel('');
            setF(k('provinsi'), provinsiOpt.find(o => o.id === id)?.name || '');
            setF(k('kota'), ''); setF(k('kec'), ''); setF(k('kel'), '');
          }} className={inp}>
            <option value="">Pilih Provinsi</option>
            {provinsiOpt.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div><label className={lbl}>Kota/Kabupaten *</label>
          <select value={kotaId} disabled={!provinsiId} onChange={e => {
            const id = e.target.value;
            setKotaIdSel(id); setKecIdSel('');
            setF(k('kota'), kotaOpt.find(o => o.id === id)?.name || '');
            setF(k('kec'), ''); setF(k('kel'), '');
          }} className={inp}>
            <option value="">{!provinsiId ? 'Pilih provinsi dulu' : loadingKota ? 'Memuat...' : 'Pilih Kota/Kabupaten'}</option>
            {kotaOpt.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Kecamatan *</label>
          <select value={kecId} disabled={!kotaId} onChange={e => {
            const id = e.target.value;
            setKecIdSel(id);
            setF(k('kec'), kecOpt.find(o => o.id === id)?.name || '');
            setF(k('kel'), '');
          }} className={inp}>
            <option value="">{!kotaId ? 'Pilih kota/kabupaten dulu' : loadingKec ? 'Memuat...' : 'Pilih Kecamatan'}</option>
            {kecOpt.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div><label className={lbl}>Kelurahan *</label>
          <select value={form[k('kel')] || ''} disabled={!kecId} onChange={e => setF(k('kel'), e.target.value)} className={inp}>
            <option value="">{!kecId ? 'Pilih kecamatan dulu' : loadingKel ? 'Memuat...' : 'Pilih Kelurahan'}</option>
            {kelOpt.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>
        </div>
      </div>
      <div><label className={lbl}>Nama Jalan *</label>
        <input value={form[k('jalan')]} onChange={e=>setF(k('jalan'),e.target.value)} className={inp}/></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={lbl}>No. Rumah *</label>
          <input value={form[k('norumah')]} onChange={e=>setF(k('norumah'),onlyDigits(e.target.value,5))}
            inputMode="numeric" maxLength={5} className={inp}/></div>
        <div><label className={lbl}>RT *</label>
          <input value={form[k('rt')]} onChange={e=>setF(k('rt'),onlyDigits(e.target.value,4))}
            inputMode="numeric" maxLength={4} className={inp}/></div>
        <div><label className={lbl}>RW *</label>
          <input value={form[k('rw')]} onChange={e=>setF(k('rw'),onlyDigits(e.target.value,4))}
            inputMode="numeric" maxLength={4} className={inp}/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Kode Pos</label>
          <input value={form[k('kp')]} onChange={e=>setF(k('kp'),onlyDigits(e.target.value,6))}
            inputMode="numeric" maxLength={6} className={inp}/></div>
        <div><label className={lbl}>Negara *</label>
          <input value={form[k('negara')]} onChange={e=>setF(k('negara'),e.target.value)} className={inp}/></div>
      </div>
    </>
  );
}

// Field wajib per alamat (KTP/domisili/pengiriman pakai aturan sama) — Kode
// Pos sengaja TETAP opsional (dikonfirmasi user), sisanya wajib biar alamat
// jamaah/perwakilan bisa dilacak lengkap (bukan cuma jalan+kota).
export function alamatLengkap(form, suffix) {
  const k = (name) => (form[`${name}${suffix}`] || '').trim();
  return !!(k('jalan') && k('norumah') && k('rt') && k('rw') && k('kel') && k('kec') && k('kota') && k('provinsi') && k('negara'));
}
