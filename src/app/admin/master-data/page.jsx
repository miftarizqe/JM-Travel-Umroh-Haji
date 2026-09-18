'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import PaketTematikManager from '@/app/components/PaketTematikManager';
import { useCurrentUser } from '@/lib/useCurrentUser';
import ModulNegaraTab from './_fitur/modul-negara/controller';
import { ambilModulNegara } from './_fitur/modul-negara/model';
import MasterItemTab from './_fitur/master-item/controller';
import { ambilMasterItem } from './_fitur/master-item/model';
import JenisProgramTab from './_fitur/jenis-program/controller';
import { ambilJenisProgram } from './_fitur/jenis-program/model';
import { useKursController } from './_fitur/kurs/controller';
import { ambilPengaturanKurs } from './_fitur/kurs/model';
import KursView from './_fitur/kurs/view';
import MasterHotelTab from './_fitur/master-hotel/controller';
import { ambilHotel } from './_fitur/master-hotel/model';
import MasterTiketTab from './_fitur/master-tiket/controller';
import { ambilTiket } from './_fitur/master-tiket/model';

// Sub-tab dalam grup "🗃️ Master" — dulu 3 tab terpisah (Hotel/Tiket/Master
// Item) + Kurs nyasar ke halaman Pengaturan Umum, digabung jadi 1 grup biar
// gak berserakan (dikonfirmasi user 2026-08-18).
const MASTER_SUBTABS = ['hotel', 'tiket', 'master-item', 'kurs'];

// Pusat data master JM Travel (2026-08-16) — Modul Negara (Dubai/Turkey dkk,
// dulu nempel di /admin/program-costing) + Master Harga Hotel & Tiket
// Pesawat (per periode, dipakai "Isi dari Master" di KalkulatorTerpadu.jsx)
// digabung jadi 1 "cluster" biar admin cuma perlu 1 tempat buat ganti data
// master apapun. Beda level dari data master ini: Modul Negara punya bracket
// tier per-jumlah-jamaah (bisa langsung dipakai program), Hotel/Tiket cuma
// flat rate per periode (dipakai buat "bantu isi form" doang, snapshot).
//
// File ini cuma "shell": tab nav + guard super_admin + muat() (orkestrasi
// Model tiap fitur). Tiap fitur (Modul Negara/Master Item/Jenis
// Program/Kurs/Hotel/Tiket) py folder MVC sendiri di _fitur/<nama>/ —
// model.js (akses API), view.jsx (presentational), controller.jsx (state +
// orkestrasi) — biar gampang dicari & gak numpuk di 1 file 1500 baris.
export default function MasterDataPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Memuat...</div>}>
      <MasterDataInner />
    </Suspense>
  );
}

function MasterDataInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user] = useCurrentUser();
  const [tab, setTab] = useState(searchParams.get('tab') || 'modul'); // 'modul' | 'hotel' | 'tiket' | 'master-item' | 'kurs' | 'jenis-program' | 'tematik' — hotel/tiket/master-item/kurs = sub-tab grup "Master" (MASTER_SUBTABS)

  const [modulList, setModulList] = useState([]);
  const [jenisProgramList, setJenisProgramList] = useState([]);
  const [masterList, setMasterList] = useState([]);
  const [hotelList, setHotelList] = useState([]);
  const [tiketList, setTiketList] = useState([]);
  // Kurs controller-nya HOOK, dipanggil di sini (bukan di-mount/unmount per
  // tab) biar draft yang belum disimpan gak hilang kalau admin pindah tab
  // dulu sebelum klik Simpan (perilaku asli).
  const kurs = useKursController();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') router.replace('/admin?tab=dashboard');
  }, [user, router]);

  function muat() {
    Promise.all([
      ambilModulNegara(),
      ambilHotel(),
      ambilTiket(),
      ambilMasterItem(),
      ambilJenisProgram(),
      ambilPengaturanKurs(),
    ]).then(([mn, h, t, m, jp, kursData]) => {
      setModulList(mn);
      setHotelList(h);
      setTiketList(t);
      setMasterList(m);
      setJenisProgramList(jp);
      kurs.setFormKurs(kursData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { muat(); }, []);

  if (!user || user.role !== 'super_admin') {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🗂️ Master Data" backHref="/admin?tab=dashboard">
      <div className="text-xs text-gray-400 mb-4">
        Khusus super admin. Pusat data master JM Travel — Modul Negara (Dubai/Turkey dkk), Master (Hotel/Tiket Pesawat/Item/Kurs), Jenis Program,
        dan Paket Tematik (paket private/custom kayak &quot;Program Umroh Berdua&quot; yang dijual lewat Kalkulator Estimasi Publik),
        semua dipakai bareng oleh <a href="/admin/program-costing" className="text-[#1A4FA0] font-semibold hover:underline">Costing Program</a> —
        1 tempat buat semua data master &amp; paket publik, gak perlu bolak-balik halaman lain (dikonfirmasi user 2026-08-18).
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setTab('modul')} className={`text-sm font-bold px-4 py-2 rounded-xl ${tab === 'modul' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🌍 Modul Negara</button>
        <button onClick={() => setTab(MASTER_SUBTABS.includes(tab) ? tab : 'hotel')} className={`text-sm font-bold px-4 py-2 rounded-xl ${MASTER_SUBTABS.includes(tab) ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🗃️ Master</button>
        <button onClick={() => setTab('jenis-program')} className={`text-sm font-bold px-4 py-2 rounded-xl ${tab === 'jenis-program' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🗂️ Jenis Program</button>
        <button onClick={() => setTab('tematik')} className={`text-sm font-bold px-4 py-2 rounded-xl ${tab === 'tematik' ? 'bg-[#1A4FA0] text-white' : 'bg-gray-100 text-gray-500'}`}>🎯 Paket Tematik</button>
      </div>

      {MASTER_SUBTABS.includes(tab) && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('hotel')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'hotel' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>🏨 Hotel</button>
          <button onClick={() => setTab('tiket')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'tiket' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>✈️ Tiket Pesawat</button>
          <button onClick={() => setTab('master-item')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'master-item' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>📋 Master Item</button>
          <button onClick={() => setTab('kurs')} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${tab === 'kurs' ? 'bg-[#0E2F6E] text-white' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>💱 Kurs</button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Memuat...</div>
      ) : tab === 'modul' ? (
        <ModulNegaraTab modulList={modulList} reload={muat} />
      ) : tab === 'master-item' ? (
        <MasterItemTab masterList={masterList} modulList={modulList} reload={muat} />
      ) : tab === 'jenis-program' ? (
        <JenisProgramTab jenisProgramList={jenisProgramList} reload={muat} />
      ) : tab === 'kurs' ? (
        <KursView formKurs={kurs.formKurs} busyKurs={kurs.busyKurs} savedKurs={kurs.savedKurs} onUbahField={kurs.ubahField} onSimpan={kurs.simpanKurs} />
      ) : tab === 'hotel' ? (
        <MasterHotelTab hotelList={hotelList} reload={muat} />
      ) : tab === 'tematik' ? (
        <PaketTematikManager />
      ) : (
        <MasterTiketTab tiketList={tiketList} modulList={modulList} reload={muat} />
      )}
    </Layout>
  );
}
