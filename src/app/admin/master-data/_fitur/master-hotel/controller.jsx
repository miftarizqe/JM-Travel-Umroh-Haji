'use client';
import { useState } from 'react';
import MasterHotelView from './view';
import { kosongHotel, kosongPeriode } from './helpers';
import { simpanHotel, simpanPeriodeAwal, toggleAktifHotel, hapusHotel, simpanPeriode, hapusPeriode } from './model';

export default function MasterHotelTab({ hotelList, reload }) {
  const [hotelFormTerbuka, setHotelFormTerbuka] = useState(false);
  const [editHotelId, setEditHotelId] = useState(null);
  const [formHotel, setFormHotel] = useState(kosongHotel());
  // Periode-periode yang diisi LANGSUNG di form "Tambah Hotel" (sebelum
  // hotelnya kesimpen sama sekali) — admin bisa "+ Tambah Periode Lagi"
  // berkali-kali di sini, semuanya baru beneran di-POST bareng pas Simpan
  // hotel ditekan (dikonfirmasi user 2026-08-18: gak mau nunggu save dulu
  // baru bisa isi periode lain).
  const [formPeriodeBaru, setFormPeriodeBaru] = useState([kosongPeriode()]);
  const [busyHotel, setBusyHotel] = useState(false);
  const [periodeFormUntuk, setPeriodeFormUntuk] = useState(null); // id master_hotel yang lagi dibuka form periode-nya
  const [editPeriodeId, setEditPeriodeId] = useState(null);
  const [formPeriode, setFormPeriode] = useState(kosongPeriode());
  const [busyPeriode, setBusyPeriode] = useState(false);

  function mulaiBaruHotel() {
    setEditHotelId(null);
    setFormHotel(kosongHotel());
    setFormPeriodeBaru([kosongPeriode()]);
    setHotelFormTerbuka(true);
  }
  function bukaEditHotel(h) {
    setEditHotelId(h.id);
    setFormHotel({ kota: h.kota, bintang: h.bintang, nama_hotel: h.nama_hotel });
    setHotelFormTerbuka(true);
  }
  function ubahFormHotel(patch) {
    setFormHotel(prev => ({ ...prev, ...patch }));
  }
  function tambahBarisPeriodeBaru() {
    setFormPeriodeBaru(prev => [...prev, kosongPeriode()]);
  }
  function ubahBarisPeriodeBaru(idx, patch) {
    setFormPeriodeBaru(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function hapusBarisPeriodeBaru(idx) {
    setFormPeriodeBaru(prev => prev.filter((_, i) => i !== idx));
  }
  async function simpanHotelHandler() {
    setBusyHotel(true);
    try {
      if (!formHotel.nama_hotel.trim()) { alert('Nama hotel wajib diisi'); setBusyHotel(false); return; }
      const { res, d } = await simpanHotel(formHotel, editHotelId);
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyHotel(false); return; }
      // Hotel BARU (bukan edit) — sekalian bikin SEMUA baris periode yang
      // udah diisi admin di form yang sama (bisa lebih dari 1, lihat
      // "+ Tambah Periode Lagi") dalam 1 langkah, biar gak perlu nunggu
      // hotel-nya kesimpen dulu baru bisa isi periode lain (dikonfirmasi
      // user 2026-08-18). Baris kosong (rate semua 0/kosong) di-skip, gak
      // ikut kesimpen jadi periode nyampah. Nambah periode BERIKUTNYA (buat
      // hotel yang udah ada) tetap lewat "+ Tambah Periode" di kartu hotel.
      if (!editHotelId) {
        const periodeDiisi = formPeriodeBaru.filter(p => (Number(p.rate_double) || 0) + (Number(p.rate_triple) || 0) + (Number(p.rate_quad) || 0) > 0);
        const hasilPeriode = await Promise.all(periodeDiisi.map(p => simpanPeriodeAwal(d.id, p)));
        const gagal = hasilPeriode.find(h => !h.ok);
        if (gagal) alert(gagal.d.error || 'Hotel tersimpan, tapi ada periode yang gagal kesimpen — buka hotelnya & tambah periode manual.');
      }
      setHotelFormTerbuka(false);
      reload();
    } catch { alert('Terjadi kesalahan'); }
    setBusyHotel(false);
  }
  async function toggleAktif(h) {
    await toggleAktifHotel(h);
    reload();
  }
  async function hapus(h) {
    if (!confirm(`Hapus hotel "${h.nama_hotel}" beserta semua periode harganya?`)) return;
    const { res, d } = await hapusHotel(h.id);
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    reload();
  }

  // ---- Periode-Rate handlers (anak dari Master Hotel) ----
  function mulaiBaruPeriode(hotelId) {
    setEditPeriodeId(null);
    setFormPeriode(kosongPeriode());
    setPeriodeFormUntuk(hotelId);
  }
  function bukaEditPeriode(hotelId, p) {
    setEditPeriodeId(p.id);
    setFormPeriode({
      periode_mulai: p.periode_mulai ? String(p.periode_mulai).slice(0, 10) : '',
      periode_selesai: p.periode_selesai ? String(p.periode_selesai).slice(0, 10) : '',
      berlaku_sampai: p.berlaku_sampai ? String(p.berlaku_sampai).slice(0, 10) : '',
      rate_double: p.rate_double, rate_triple: p.rate_triple, rate_quad: p.rate_quad, mata_uang: p.mata_uang,
    });
    setPeriodeFormUntuk(hotelId);
  }
  function ubahFormPeriode(patch) {
    setFormPeriode(prev => ({ ...prev, ...patch }));
  }
  async function simpanPeriodeHandler(hotelId) {
    setBusyPeriode(true);
    try {
      const { res, d } = await simpanPeriode(hotelId, formPeriode, editPeriodeId);
      if (!res.ok) { alert(d.error || 'Gagal menyimpan'); setBusyPeriode(false); return; }
      setPeriodeFormUntuk(null);
      reload();
    } catch { alert('Terjadi kesalahan'); }
    setBusyPeriode(false);
  }
  async function hapusPeriodeHandler(p) {
    if (!confirm('Hapus periode harga ini?')) return;
    const { res, d } = await hapusPeriode(p.id);
    if (!res.ok) { alert(d.error || 'Gagal menghapus'); return; }
    reload();
  }

  return (
    <MasterHotelView
      hotelList={hotelList}
      hotelFormTerbuka={hotelFormTerbuka} editHotelId={editHotelId} formHotel={formHotel} formPeriodeBaru={formPeriodeBaru} busyHotel={busyHotel}
      periodeFormUntuk={periodeFormUntuk} formPeriode={formPeriode} busyPeriode={busyPeriode}
      onMulaiBaruHotel={mulaiBaruHotel} onBukaEditHotel={bukaEditHotel} onTutupFormHotel={() => setHotelFormTerbuka(false)} onUbahFormHotel={ubahFormHotel}
      onTambahBarisPeriodeBaru={tambahBarisPeriodeBaru} onUbahBarisPeriodeBaru={ubahBarisPeriodeBaru} onHapusBarisPeriodeBaru={hapusBarisPeriodeBaru}
      onSimpanHotel={simpanHotelHandler} onToggleAktifHotel={toggleAktif} onHapusHotel={hapus}
      onMulaiBaruPeriode={mulaiBaruPeriode} onBukaEditPeriode={bukaEditPeriode} onTutupPeriode={() => setPeriodeFormUntuk(null)}
      onUbahFormPeriode={ubahFormPeriode} onSimpanPeriode={simpanPeriodeHandler} onHapusPeriode={hapusPeriodeHandler}
    />
  );
}
