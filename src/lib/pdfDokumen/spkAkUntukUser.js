// PDF SPK-AK / SPK-AK Non-Muslim resmi (template final, identitas terisi)
// untuk 1 anggota Sahabat Baitullah — SATU fungsi yang dipakai semua jalur
// "lihat/cetak" (dikonfirmasi user 2026-10-01): /api/sahabat/unduh-spk-ak
// (anggota sendiri) dan /api/admin/cetak-spk-ak/[user_id] (admin/super_admin/
// HoP). Varian dipilih dari agama akun, nomor surat dibekukan sekali
// (ambilAtauBuatNomorSurat, idempotent). Jalur TTD digital punya generator
// sendiri di /api/admin/dokumen-signature tapi template-nya sama persis.
//
// SPK-AK (Muslim) SEKARANG punya 2 rangkap (dikonfirmasi user 2026-10-03),
// TAPI yang digabung jadi 2 PDF cuma buat metode_ttd_sahabat='kantor' (admin
// siapin keduanya sekaligus buat TTD langsung di tempat). Metode 'kirim'
// (print sendiri, termasuk NULL/belum pilih) cuma dapat rangkap "jamaah" —
// rangkap "management" dicetak & dikirim terpisah oleh kantor sendiri,
// BUKAN lewat unduhan jamaah (lihat buatPdfSpkAkUntukUser). SPK-AK Non-Muslim
// BELUM dapat template 2-rangkap baru, tetap 1 dokumen seperti sebelumnya.
import { generateSpkAkPdf, generateSpkAkRangkapPdf } from './spkAkOverlay';
import { mergePdfBuffers } from './dokumenSahabatGabungan';
import { ambilAtauBuatNomorSurat } from '@/lib/nomorSurat';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const errStatus = (message, status) => Object.assign(new Error(message), { status });

// Baris 1: jalan + no rumah + RT/RW. Baris 2: kelurahan, kecamatan, kota,
// provinsi. Dikonfirmasi user 2026-10-03 — "No Rumah" diprefix "No.", RT/RW
// diprefix hurufnya ("RT x/RW y"), baris 2 diakhiri titik.
function formatAlamatDuaBaris(user) {
  if (!user.alamat_ktp_jalan) {
    return { alamatBaris1: user.alamat_ktp || user.alamat || '-', alamatBaris2: '' };
  }
  const baris1 = [
    user.alamat_ktp_jalan,
    user.alamat_ktp_no_rumah ? `No. ${user.alamat_ktp_no_rumah}` : null,
    (user.alamat_ktp_rt || user.alamat_ktp_rw) ? `RT ${user.alamat_ktp_rt || '-'}/RW ${user.alamat_ktp_rw || '-'}` : null,
  ].filter(Boolean).join(', ');
  const baris2Isi = [user.alamat_ktp_kelurahan, user.alamat_ktp_kecamatan, user.alamat_ktp_kota, user.alamat_ktp_provinsi]
    .filter(Boolean).join(', ');
  return { alamatBaris1: baris1, alamatBaris2: baris2Isi ? `${baris2Isi}.` : '' };
}

/** @returns {Promise<{ pdfBuffer: Uint8Array, nomor: string, dokumen: string }>} */
export async function buatPdfSpkAkUntukUser(pool, userId) {
  const [[user]] = await pool.query(
    `SELECT id, name, wa, email, alamat, alamat_ktp, role, agama, no_paspor, metode_ttd_sahabat,
            alamat_ktp_jalan, alamat_ktp_no_rumah, alamat_ktp_rt, alamat_ktp_rw,
            alamat_ktp_kelurahan, alamat_ktp_kecamatan, alamat_ktp_kota, alamat_ktp_provinsi, alamat_ktp_negara
     FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) throw errStatus('Akun tidak ditemukan', 404);
  if (user.role !== 'sahabat_baitullah') throw errStatus('Dokumen ini hanya berlaku untuk Jamaah Sahabat Baitullah', 400);

  const dokumen = user.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
  const nomorKolom = dokumen === 'spk_ak' ? 'no_spk_ak' : 'no_spk_ak_nonis';
  const nomorJenis = dokumen === 'spk_ak' ? 'JSB' : 'JSB-NM';
  const nomor = await ambilAtauBuatNomorSurat(pool, user.id, nomorJenis, nomorKolom);

  const sekarang = new Date();
  const dataUmum = {
    nomor,
    nama: user.name, alamat: user.alamat_ktp || user.alamat || '-', noTelepon: user.wa || '-', noPaspor: user.no_paspor || '-',
    namaTtd: user.name,
    hari: HARI_ID[sekarang.getDay()],
    tanggal: `${sekarang.getDate()} ${BULAN_ID[sekarang.getMonth()]} ${sekarang.getFullYear()}`,
  };

  if (dokumen === 'spk_ak') {
    // Target Impian (program + harga) WAJIB diisi jamaah sejak pendaftaran
    // (lihat daftar-sahabat/page.jsx) — program_id SELALU ada di titik ini.
    const [[pendaftaran]] = await pool.query(
      `SELECT sp.target_estimasi_harga, p.tanggal_berangkat
       FROM sahabat_pendaftaran sp LEFT JOIN programs p ON p.id = sp.program_id
       WHERE sp.user_id = ? ORDER BY sp.id DESC LIMIT 1`,
      [userId]
    );
    const berangkat = pendaftaran?.tanggal_berangkat ? new Date(pendaftaran.tanggal_berangkat) : null;
    // Template rangkap punya 2 baris alamat (dikonfirmasi user 2026-10-03,
    // revisi dokumen Word baru) -- dipecah dari komponen alamat_ktp_* kalau
    // ada (pendaftar baru). Pendaftar lama yang cuma punya alamat_ktp hasil
    // join lama (komponen udah kebuang) fallback ke baris 1 = string penuh,
    // baris 2 kosong -- gak bisa dipecah balik akurat.
    const { alamatBaris1, alamatBaris2 } = formatAlamatDuaBaris(user);
    const dataRangkap = {
      ...dataUmum,
      alamatBaris1, alamatBaris2,
      targetBulanTahun: berangkat ? `${BULAN_ID[berangkat.getMonth()]} ${berangkat.getFullYear()}` : '-',
      nominalTarget: pendaftaran?.target_estimasi_harga ? Number(pendaftaran.target_estimasi_harga).toLocaleString('id-ID') : '-',
    };
    // 2 rangkap CUMA buat metode "datang kantor" (admin siapin 2 fisik
    // sekaligus buat TTD langsung di tempat). Metode "kirim" (print sendiri)
    // cuma rangkap "jamaah" — rangkap "management" (udah ada TTD Mei
    // Ling/Ahmad Zaky statis) dicetak & dikirim terpisah oleh kantor
    // sendiri langsung ke jamaah, BUKAN diunduh jamaah, biar gak nunggu
    // jamaah muter-balik 2 dokumen dulu (dikonfirmasi user 2026-10-03).
    if (user.metode_ttd_sahabat === 'kantor') {
      const [rangkapJamaah, rangkapManagement] = await Promise.all([
        generateSpkAkRangkapPdf('jamaah', dataRangkap),
        generateSpkAkRangkapPdf('management', dataRangkap),
      ]);
      const pdfBuffer = await mergePdfBuffers([rangkapJamaah, rangkapManagement]);
      return { pdfBuffer, nomor, dokumen };
    }
    const pdfBuffer = await generateSpkAkRangkapPdf('jamaah', dataRangkap);
    return { pdfBuffer, nomor, dokumen };
  }

  const pdfBuffer = await generateSpkAkPdf({ dokumen, ...dataUmum });
  return { pdfBuffer, nomor, dokumen };
}

export function responsPdfSpkAk({ pdfBuffer, nomor }) {
  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="SPK-AK-${String(nomor).replace(/\//g, '-')}.pdf"`,
      // Tanpa ini browser bebas nge-cache PDF yang di-generate dinamis
      // (gak ada versioning di URL-nya) — bug nyata 2026-10-03: admin masih
      // lihat template/identitas LAMA walau server udah dideploy ulang,
      // sampai hard-refresh manual.
      'Cache-Control': 'no-store',
    },
  });
}
