// Lapisan abstraksi materai digital — provider-agnostic. Provider aktif
// dipilih lewat env MATERAI_PROVIDER (default 'mock'), supaya begitu akun
// bisnis provider aktif, tinggal ganti env-nya + isi providers/mekari.js,
// tanpa bongkar pemanggil (src/app/api/admin/dokumen-signature/route.js).
// Mekari Sign dipilih 2026-09-28 (distributor resmi e-Meterai Peruri
// sekaligus provider TTD digital — satu vendor buat dua kebutuhan, lihat
// src/lib/eSignature/providers/mekari.js).
import { tambahLampiranSertifikat } from '@/lib/pdfDokumen/lampiranSertifikat';
import * as mockProvider from './providers/mock';
import * as mekariProvider from './providers/mekari';

const PROVIDERS = { mock: mockProvider, mekari: mekariProvider };

function ambilProvider(nama) {
  const p = PROVIDERS[nama];
  if (!p) throw new Error(`Provider materai "${nama}" tidak dikenal.`);
  return p;
}

/**
 * Beli e-meterai untuk 1 dokumen, lalu tempel sertifikatnya sebagai lampiran
 * halaman terakhir PDF.
 * @returns {Promise<{provider:string, kodeUnik:string, dibeliAt:Date, pdfBuffer:Buffer}>}
 */
export async function beliMaterai({ dokumen, refId, pdfBuffer, baseUrl }) {
  const namaProvider = process.env.MATERAI_PROVIDER || 'mock';
  const provider = ambilProvider(namaProvider);
  const hasil = await provider.beli({ dokumen, refId, pdfBuffer });

  const pdfBermaterai = await tambahLampiranSertifikat(pdfBuffer, {
    judul: 'LAMPIRAN — E-METERAI DIGITAL',
    baris: [
      ['Nomor Seri', hasil.kodeUnik],
      ['Provider', namaProvider === 'mock' ? 'Mock — belum terhubung Mekari Sign' : namaProvider],
      ['Nominal', 'Rp 10.000'],
      ['Dibeli pada', hasil.dibeliAt.toLocaleString('id-ID')],
    ],
    verifikasiUrl: baseUrl ? `${baseUrl}/verifikasi-meterai/${hasil.kodeUnik}` : undefined,
  });

  return { provider: namaProvider, kodeUnik: hasil.kodeUnik, dibeliAt: hasil.dibeliAt, pdfBuffer: pdfBermaterai };
}
