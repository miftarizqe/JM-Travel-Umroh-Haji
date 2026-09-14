'use client';
import { useState } from 'react';
import JenisProgramView from './view';
import { simpanJenisProgram, toggleAktifJenisProgram, hapusJenisProgram } from './model';

const KOSONG_JENIS_PROGRAM = { value: null, label: '', punya_umroh: true, boleh_modul_negara: false, tipe_program: 'Umroh', urutan: 0, aktif: true };

export default function JenisProgramTab({ jenisProgramList, reload }) {
  const [formJenisProgram, setFormJenisProgram] = useState(null);
  const [busyJenisProgram, setBusyJenisProgram] = useState(false);

  function bukaTambah() {
    setFormJenisProgram(KOSONG_JENIS_PROGRAM);
  }
  function batal() {
    setFormJenisProgram(null);
  }

  async function simpan() {
    if (!formJenisProgram.label.trim()) { alert('Nama kategori wajib diisi'); return; }
    setBusyJenisProgram(true);
    const { res, d } = await simpanJenisProgram(formJenisProgram);
    setBusyJenisProgram(false);
    if (!res.ok) { alert(d.error || 'Gagal menyimpan'); return; }
    setFormJenisProgram(null);
    reload();
  }
  async function toggleAktif(j) {
    await toggleAktifJenisProgram(j);
    reload();
  }
  async function hapus(j) {
    if (!confirm(`Hapus kategori "${j.label}"? Gak bisa dihapus kalau masih dipakai template/program/modul negara manapun.`)) return;
    const { res, d } = await hapusJenisProgram(j.value);
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    if (formJenisProgram?.value === j.value) setFormJenisProgram(null);
    reload();
  }

  return (
    <JenisProgramView
      jenisProgramList={jenisProgramList} formJenisProgram={formJenisProgram} busyJenisProgram={busyJenisProgram}
      onBukaTambah={bukaTambah} onPilihEdit={setFormJenisProgram} onChangeForm={setFormJenisProgram}
      onSimpan={simpan} onBatal={batal} onToggleAktif={toggleAktif} onHapus={hapus}
    />
  );
}
