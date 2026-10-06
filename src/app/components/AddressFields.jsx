'use client';

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

export function AddressFields({ form, setF, suffix, inp, lbl }) {
  const k = (name) => `${name}${suffix}`;
  return (
    <>
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
        <div><label className={lbl}>Kelurahan *</label>
          <input value={form[k('kel')]} onChange={e=>setF(k('kel'),e.target.value)} className={inp}/></div>
        <div><label className={lbl}>Kecamatan *</label>
          <input value={form[k('kec')]} onChange={e=>setF(k('kec'),e.target.value)} className={inp}/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Kota/Kabupaten *</label>
          <input value={form[k('kota')]} onChange={e=>setF(k('kota'),e.target.value)} className={inp}/></div>
        <div><label className={lbl}>Provinsi *</label>
          <input value={form[k('provinsi')]} onChange={e=>setF(k('provinsi'),e.target.value)} className={inp}/></div>
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
