// Lapisan abstraksi TTD digital — provider-agnostic. Provider aktif dipilih
// lewat env TTD_PROVIDER (default 'mock'), supaya begitu ada kontrak dengan
// provider tersertifikasi (Privy/Digisign/VIDA/TekenAja), tinggal salin
// providers/_template.js jadi providers/<vendor>.js, daftarkan di PROVIDERS
// di bawah, tanpa bongkar pemanggil (src/app/api/admin/dokumen-signature/route.js).
import { tambahLampiranSertifikat } from '@/lib/pdfDokumen/lampiranSertifikat';
import * as mockProvider from './providers/mock';

const PROVIDERS = { mock: mockProvider };

function ambilProvider(nama) {
  const p = PROVIDERS[nama];
  if (!p) throw new Error(`Provider TTD "${nama}" tidak dikenal/belum terhubung.`);
  return p;
}

function namaProviderAktif() {
  return process.env.TTD_PROVIDER || 'mock';
}

/** @returns {Promise<{provider:string, providerRef:string, status:string}>} */
export async function kirimUntukTtd({ dokumen, refId, signer, pdfBuffer }) {
  const namaProvider = namaProviderAktif();
  const provider = ambilProvider(namaProvider);
  const hasil = await provider.kirim({ dokumen, refId, signer, pdfBuffer });
  return { provider: namaProvider, providerRef: hasil.providerRef, status: hasil.status };
}

/**
 * Tandai sesi TTD selesai (dipicu tombol mock sekarang; nanti diganti
 * webhook provider asli) — tempel sertifikat TTD sebagai lampiran halaman
 * terakhir PDF (yang sudah bermaterai kalau perlu materai).
 * @returns {Promise<{selesaiAt:Date, pdfBuffer:Buffer}>}
 */
export async function selesaikanTtd({ providerRef, signer, pdfBuffer, dokumen }) {
  const namaProvider = namaProviderAktif();
  const provider = ambilProvider(namaProvider);
  const hasil = await provider.selesaikan({ providerRef, signer });

  const pdfFinal = await tambahLampiranSertifikat(pdfBuffer, {
    judul: 'LAMPIRAN — SERTIFIKAT TANDA TANGAN ELEKTRONIK',
    baris: [
      ['Nama Penandatangan', signer?.nama],
      ['Kontak', signer?.email || signer?.wa],
      ['Provider', namaProvider === 'mock' ? 'Mock — belum terhubung provider tersertifikasi' : namaProvider],
      ['Referensi Dokumen', providerRef],
      ['Ditandatangani pada', hasil.selesaiAt.toLocaleString('id-ID')],
    ],
  });

  return { selesaiAt: hasil.selesaiAt, pdfBuffer: pdfFinal };
}
