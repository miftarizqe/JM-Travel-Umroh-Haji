'use client';
import { useState } from 'react';

// Komponen tabel Pending (wajib ditransfer) & Forecast (proyeksi) dipakai
// bareng oleh /admin/laporan/ujroh-closing (Sahabat Baitullah) dan
// /admin/laporan/ujroh-closing-perwakilan (Perwakilan) — dulu 1 halaman
// gabungan, dipisah jadi 2 halaman di 2 section sidebar beda (dikonfirmasi
// user 2026-10-12: Perwakilan "nyasar" nongol di halaman Sahabat
// Baitullah). Label "Sudah Cair" diganti "Pending" (oranye, bukan hijau) —
// baris di tabel ini masih "Wajib Ditransfer", belum beneran cair, jadi
// "Sudah Cair" keliru buat KEDUA halaman (dikonfirmasi user, disamain).
// Forecast jadi biru (bukan amber).

export const rp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

// Sumber ujroh — bedain closing LANGSUNG (booking sendiri) vs override/leader/
// margin reseller (dari closing orang lain di jaringan bawahnya).
export const JENIS_LABEL = {
  closing_pribadi: 'Closing Langsung (Pribadi)',
  closing_bsi: 'Closing Langsung (Tabungan BSI)',
  reseller_perwakilan: 'Margin Reseller (dari downline)',
  margin_pribadi: 'Closing Langsung (Margin Pribadi)',
  margin_reseller: 'Margin Reseller (dari downline)',
  closing_langsung_sahabat: 'Closing Langsung (Booking Program)',
  referral_closing_reguler_sahabat: 'Ujroh Referral Sahabat',
  komisi_sahabat: 'Ujroh Generasi (Rekrutan)',
  head_of_program_registrasi: 'Ujroh Registrasi HOP',
  ujroh_agen: 'Ujroh Agen',
};

// Rekap 1 orang punya banyak transaksi per program+sumber jadi 1 baris —
// "kalo 1 program ada beberapa transaksi, totalin diujung" — bukan baris
// mentah per transaksi, tapi tetap kelihatan closing langsung vs override.
export function groupByProgram(detail) {
  const map = {};
  for (const item of detail) {
    const key = `${item.prog_name}__${item.jenis}`;
    if (!map[key]) {
      map[key] = {
        prog_name: item.prog_name || '-', jenis: item.jenis,
        sumber: JENIS_LABEL[item.jenis] || item.jenis,
        kategori: item.kategori || '-', bookingSet: new Set(), jumlah_jamaah: 0, nominal: 0,
      };
    }
    map[key].bookingSet.add(item.booking_id);
    map[key].jumlah_jamaah += Number(item.jumlah_jamaah || 0);
    map[key].nominal += Number(item.nominal || 0);
  }
  return Object.values(map)
    .map(g => ({ ...g, jumlah_booking: g.bookingSet.size }))
    .sort((a, b) => b.nominal - a.nominal);
}

export function DetailProgram({ grouped, adaKategori }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-400 uppercase">
            <th className="text-left px-2 py-1.5 font-bold">Program</th>
            <th className="text-left px-2 py-1.5 font-bold">Sumber</th>
            {adaKategori && <th className="text-left px-2 py-1.5 font-bold">Kategori</th>}
            <th className="text-right px-2 py-1.5 font-bold">Jml Booking</th>
            <th className="text-right px-2 py-1.5 font-bold">Jml Jamaah</th>
            <th className="text-right px-2 py-1.5 font-bold">Nominal</th>
          </tr>
        </thead>
        <tbody>
          {grouped.length === 0 && (
            <tr><td colSpan={adaKategori ? 6 : 5} className="text-center text-gray-400 py-3">Tidak ada data.</td></tr>
          )}
          {grouped.map((g, i) => (
            <tr key={i} className="border-t border-gray-200">
              <td className="px-2 py-1.5 text-gray-700">{g.prog_name}</td>
              <td className="px-2 py-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${g.jenis.startsWith('closing_') || g.jenis === 'margin_pribadi' || g.jenis === 'ujroh_agen' ? 'bg-[#E8F0FB] text-[#1A4FA0]' : 'bg-amber-100 text-amber-700'}`}>
                  {g.sumber}
                </span>
              </td>
              {adaKategori && <td className="px-2 py-1.5 text-gray-500">{g.kategori}</td>}
              <td className="px-2 py-1.5 text-right text-gray-500">{g.jumlah_booking}</td>
              <td className="px-2 py-1.5 text-right text-gray-500">{g.jumlah_jamaah}</td>
              <td className="px-2 py-1.5 text-right font-bold text-[#0E2F6E]">{rp(g.nominal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==================== TABEL PENDING (wajib ditransfer) ====================
function BarisClosing({ orang, showBsi, showRekening }) {
  const [buka, setBuka] = useState(false);
  const grouped = groupByProgram(orang.realized_detail);
  return (
    <>
      <tr onClick={() => setBuka(b => !b)} className="cursor-pointer hover:bg-[#F8F9FD] border-t border-gray-100">
        <td className="px-3 py-2.5">
          <div className="font-semibold text-gray-700">{orang.name} {orang.role === 'hop' && <span className="text-[9px] font-bold text-white bg-[#1A4FA0] px-1.5 py-0.5 rounded-full align-middle">HOP</span>}</div>
          <div className="text-[10px] text-gray-400">
            {orang.kode_unik} {!showRekening ? null : orang.bank ? `· ${orang.bank} ${orang.no_rekening || ''}` : <span className="text-red-400">· rekening belum diisi</span>}
          </div>
        </td>
        {showBsi && <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{rp(orang.realized_pribadi)}</td>}
        {showBsi && <td className="px-3 py-2.5 text-right text-purple-600 whitespace-nowrap">{rp(orang.realized_bsi)}</td>}
        <td className="px-3 py-2.5 text-right font-black text-orange-600 whitespace-nowrap">{rp(orang.realized_total)}</td>
        <td className="px-3 py-2.5 text-center text-gray-400 w-6">{buka ? '▲' : '▼'}</td>
      </tr>
      {buka && (
        <tr>
          <td colSpan={showBsi ? 5 : 3} className="bg-gray-50 border-t border-gray-100 p-3">
            <DetailProgram grouped={grouped} adaKategori />
          </td>
        </tr>
      )}
    </>
  );
}

// showBsi=false buat Sahabat Baitullah -- jenis ujroh-nya gak pernah
// kekunci Tabungan BSI (lihat kategoriRekening di laporanUjroh.js), kolom
// itu bakal selalu Rp0 kalau dipaksa tampil, jadi dibuang aja bukan
// nampilin kolom percuma.
export function TabelClosing({ list, showBsi = true, showRekening = true }) {
  const total = list.reduce((acc, o) => ({
    realized_pribadi: acc.realized_pribadi + o.realized_pribadi,
    realized_bsi: acc.realized_bsi + o.realized_bsi,
    realized_total: acc.realized_total + o.realized_total,
  }), { realized_pribadi: 0, realized_bsi: 0, realized_total: 0 });

  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-orange-50 text-orange-700 text-xs uppercase">
            <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Nama</th>
            {showBsi && <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Rekening Pribadi</th>}
            {showBsi && <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Tabungan BSI</th>}
            <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Total Closing</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={showBsi ? 5 : 3} className="text-center text-gray-400 py-8">Belum ada yang cair pada periode ini.</td></tr>
          )}
          {list.map(o => <BarisClosing key={o.id} orang={o} showBsi={showBsi} showRekening={showRekening} />)}
        </tbody>
        {list.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-orange-500 bg-orange-50/60 font-bold">
              <td className="px-3 py-2.5 text-orange-700">TOTAL</td>
              {showBsi && <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{rp(total.realized_pribadi)}</td>}
              {showBsi && <td className="px-3 py-2.5 text-right text-purple-700 whitespace-nowrap">{rp(total.realized_bsi)}</td>}
              <td className="px-3 py-2.5 text-right text-orange-700 whitespace-nowrap">{rp(total.realized_total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ==================== TABEL FORECAST (belum closing) ====================
function BarisForecast({ orang }) {
  const [buka, setBuka] = useState(false);
  const grouped = groupByProgram(orang.forecast_detail);
  return (
    <>
      <tr onClick={() => setBuka(b => !b)} className="cursor-pointer hover:bg-[#F8F9FD] border-t border-gray-100">
        <td className="px-3 py-2.5">
          <div className="font-semibold text-gray-700">{orang.name} {orang.role === 'hop' && <span className="text-[9px] font-bold text-white bg-[#1A4FA0] px-1.5 py-0.5 rounded-full align-middle">HOP</span>}</div>
          <div className="text-[10px] text-gray-400">{orang.kode_unik}</div>
        </td>
        <td className="px-3 py-2.5 text-right font-black text-[#1A4FA0] whitespace-nowrap">{rp(orang.forecast_total)}</td>
        <td className="px-3 py-2.5 text-center text-gray-400 w-6">{buka ? '▲' : '▼'}</td>
      </tr>
      {buka && (
        <tr>
          <td colSpan={3} className="bg-gray-50 border-t border-gray-100 p-3">
            <DetailProgram grouped={grouped} adaKategori={false} />
          </td>
        </tr>
      )}
    </>
  );
}

export function TabelForecast({ list }) {
  const total = list.reduce((s, o) => s + o.forecast_total, 0);

  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#E8F0FB] text-[#1A4FA0] text-xs uppercase">
            <th className="text-left px-3 py-2.5 font-bold whitespace-nowrap">Nama</th>
            <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">Total Forecast</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={3} className="text-center text-gray-400 py-8">Tidak ada potensi ujroh yang belum closing.</td></tr>
          )}
          {list.map(o => <BarisForecast key={o.id} orang={o} />)}
        </tbody>
        {list.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-[#1A4FA0] bg-[#E8F0FB]/60 font-bold">
              <td className="px-3 py-2.5 text-[#1A4FA0]">TOTAL</td>
              <td className="px-3 py-2.5 text-right text-[#1A4FA0] whitespace-nowrap">{rp(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
