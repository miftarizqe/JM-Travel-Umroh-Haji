// PDF SPK-AK / SPK-AK Non-Muslim resmi (template final, identitas terisi)
// untuk 1 anggota Sahabat Baitullah — SATU fungsi yang dipakai semua jalur
// "lihat/cetak" (dikonfirmasi user 2026-10-01): /api/sahabat/unduh-spk-ak
// (anggota sendiri) dan /api/admin/cetak-spk-ak/[user_id] (admin/super_admin/
// HoP). Varian dipilih dari agama akun, nomor surat & tanggal TTD dibekukan
// sekali (ambilAtauBuatNomorSurat/ambilAtauBuatTanggalBeku, idempotent).
// Jalur TTD digital punya generator sendiri di /api/admin/dokumen-signature
// tapi template-nya sama persis.
//
// SPK-AK (Muslim) & SPK-AK Non-Muslim/AGEN SEKARANG SAMA-SAMA 2 rangkap
// (Muslim dikonfirmasi user 2026-10-03, Non-Muslim/AGEN menyusul 2026-10-18)
// — TAPI yang digabung jadi 2 PDF cuma buat metode_ttd_sahabat='kantor'
// (admin siapin keduanya sekaligus buat TTD langsung di tempat). Metode
// 'kirim' (print sendiri, termasuk NULL/belum pilih) cuma dapat rangkap
// "jamaah" — rangkap "management" dicetak & dikirim terpisah oleh kantor
// sendiri, BUKAN lewat unduhan jamaah (lihat buatPdfSpkAkUntukUser).
import { generateSpkAkPdf, generateSpkAkRangkapPdf, generateSpkAkNonisRangkapPdf } from './spkAkOverlay';
import { mergePdfBuffers } from './dokumenSahabatGabungan';
import { ambilAtauBuatNomorSurat, ambilAtauBuatTanggalBeku } from '@/lib/nomorSurat';
import { formatAlamatDuaBaris } from './alamatDuaBaris';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const errStatus = (message, status) => Object.assign(new Error(message), { status });

/**
 * @param {{ rangkap?: 'jamaah'|'management' }} [opts] - KHUSUS admin (dikonfirmasi
 *   user 2026-10-17), buat ambil rangkap "management" secara terpisah pas metode
 *   jamaah "kirim" (biasanya cuma dapat rangkap "jamaah" doang, lihat komentar di
 *   bawah) — office butuh rangkap management buat dicetak & dikirim manual ke
 *   jamaah. Default (gak diisi) = perilaku lama persis, JANGAN diubah: dipakai
 *   jamaah unduh sendiri di /api/sahabat/unduh-spk-ak.
 * @returns {Promise<{ pdfBuffer: Uint8Array, nomor: string, dokumen: string }>}
 */
export async function buatPdfSpkAkUntukUser(pool, userId, opts = {}) {
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
  const nomorJenis = dokumen === 'spk_ak' ? 'JSB' : 'ASB';
  const tanggalKolom = dokumen === 'spk_ak' ? 'tgl_spk_ak' : 'tgl_spk_ak_nonis';
  const nomor = await ambilAtauBuatNomorSurat(pool, user.id, nomorJenis, nomorKolom);
  // Tanggal TTD dibekukan BARENG nomor (dikonfirmasi user 2026-10-12) --
  // siapa pun yang DULUAN baca dokumen ini (jamaah di /pks, atau admin
  // kirim TTD digital di kirimSpkAkTunggalUntukTtd) yang mbekuin tanggalnya.
  const sekarang = await ambilAtauBuatTanggalBeku(pool, user.id, tanggalKolom);
  const dataUmum = {
    nomor,
    nama: user.name, alamat: user.alamat_ktp || user.alamat || '-', noTelepon: user.wa || '-', noPaspor: user.no_paspor || '-',
    namaTtd: user.name,
    hari: HARI_ID[sekarang.getDay()],
    tanggal: `${sekarang.getDate()} ${BULAN_ID[sekarang.getMonth()]} ${sekarang.getFullYear()}`,
  };

  if (dokumen === 'spk_ak' || dokumen === 'spk_ak_nonis') {
    // Target Impian (program + harga) WAJIB diisi jamaah/agen sejak
    // pendaftaran (lihat daftar-sahabat/page.jsx) — program_id SELALU ada
    // di titik ini, sama buat Muslim maupun Non-Muslim (AGEN juga punya
    // target program umroh yang disepakati, Pasal 4.1 PKS Agen).
    const [[pendaftaran]] = await pool.query(
      `SELECT sp.target_estimasi_harga, p.tanggal_berangkat
       FROM sahabat_pendaftaran sp LEFT JOIN programs p ON p.id = sp.program_id
       WHERE sp.user_id = ? ORDER BY sp.id DESC LIMIT 1`,
      [userId]
    );
    const berangkat = pendaftaran?.tanggal_berangkat ? new Date(pendaftaran.tanggal_berangkat) : null;
    const dataTarget = {
      targetBulanTahun: berangkat ? `${BULAN_ID[berangkat.getMonth()]} ${berangkat.getFullYear()}` : '-',
      nominalTarget: pendaftaran?.target_estimasi_harga ? Number(pendaftaran.target_estimasi_harga).toLocaleString('id-ID') : '-',
    };

    // generateSpkAkRangkapPdf (Muslim) vs generateSpkAkNonisRangkapPdf
    // (Agen) -- beda fungsi & beda koordinat template, tapi dua-duanya
    // SEKARANG sama-sama alamat 2 baris (ditemukan & diperbaiki 2026-10-21,
    // sebelumnya Nonis dipepetin 1 baris lewat drawFitKiri). API pemanggilnya
    // (opts.rangkap, metode kantor/kirim) sama persis buat dua-duanya, jadi
    // dipilih sekali di sini lewat variabel generator & dataRangkap, bukan
    // diduplikasi 2x di bawah.
    let generator, dataRangkap;
    if (dokumen === 'spk_ak') {
      // Template rangkap punya 2 baris alamat (dikonfirmasi user 2026-10-03,
      // revisi dokumen Word baru) -- dipecah dari komponen alamat_ktp_* kalau
      // ada (pendaftar baru). Pendaftar lama yang cuma punya alamat_ktp hasil
      // join lama (komponen udah kebuang) fallback ke baris 1 = string penuh,
      // baris 2 kosong -- gak bisa dipecah balik akurat.
      const { alamatBaris1, alamatBaris2 } = formatAlamatDuaBaris(user);
      generator = generateSpkAkRangkapPdf;
      dataRangkap = { ...dataUmum, alamatBaris1, alamatBaris2, ...dataTarget };
    } else {
      // spk_ak_nonis (AGEN) -- alamat panjang kebaca kekecilan dipepetin 1
      // baris (screenshot user 2026-10-21) -- ternyata template-nya SUDAH
      // punya ruang kosong ~2 baris antara Alamat & No. Telepon (diukur
      // pdftotext -bbox, gap 27.6pt vs 13.7pt baris normal lainnya), jadi
      // dipecah 2 baris juga kayak versi Muslim, TANPA perlu edit template.
      const { alamatBaris1, alamatBaris2 } = formatAlamatDuaBaris(user);
      generator = generateSpkAkNonisRangkapPdf;
      dataRangkap = { ...dataUmum, alamatBaris1, alamatBaris2, ...dataTarget };
    }

    // 2 rangkap CUMA buat metode "datang kantor" (admin siapin 2 fisik
    // sekaligus buat TTD langsung di tempat). Metode "kirim" (print sendiri)
    // cuma rangkap "jamaah" — rangkap "management" (udah ada TTD Mei
    // Ling/Ahmad Zaky statis) dicetak & dikirim terpisah oleh kantor
    // sendiri langsung ke jamaah, BUKAN diunduh jamaah, biar gak nunggu
    // jamaah muter-balik 2 dokumen dulu (dikonfirmasi user 2026-10-03).
    // Admin minta 1 rangkap spesifik (dikonfirmasi user 2026-10-17) --
    // menang dari logic metode di bawah, berlaku buat kedua metode (kirim
    // ATAU kantor) biar admin tetap bisa ambil rangkap jamaah terpisah juga
    // kalau jamaahnya minta diprintin ulang.
    if (opts.rangkap === 'jamaah' || opts.rangkap === 'management') {
      const pdfBuffer = await generator(opts.rangkap, dataRangkap);
      return { pdfBuffer, nomor, dokumen };
    }
    if (user.metode_ttd_sahabat === 'kantor') {
      const [rangkapJamaah, rangkapManagement] = await Promise.all([
        generator('jamaah', dataRangkap),
        generator('management', dataRangkap),
      ]);
      const pdfBuffer = await mergePdfBuffers([rangkapJamaah, rangkapManagement]);
      return { pdfBuffer, nomor, dokumen };
    }
    const pdfBuffer = await generator('jamaah', dataRangkap);
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
