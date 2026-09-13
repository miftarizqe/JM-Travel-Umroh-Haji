// Logika inti pembuatan 1 booking — dipakai baik oleh POST /api/bookings
// (1 booking) maupun POST /api/bookings/batch (keranjang multi-item, tiap
// item jadi booking terpisah dalam 1 transaksi). `conn` boleh pool atau
// connection transaksi, pola sama seperti src/lib/closing.js.
import { hitungHargaCustomHotelDenganDb } from './hotelCustomPricing';

function generateBookingId() {
  return 'JMT-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function errStatus(message, status) {
  return Object.assign(new Error(message), { status });
}

// Gerbang: perwakilan/sahabat yang belum di-ACC admin, atau akun belum
// terverifikasi, tidak boleh order jamaah. Dipakai di awal route sebelum
// memproses booking apapun (single maupun batch).
export async function cekPemesanBolehOrder(conn, userId) {
  const [pemesan] = await conn.query(
    'SELECT role, status, terverifikasi FROM users WHERE id = ?', [userId]
  );
  if (pemesan.length === 0) {
    throw errStatus('User tidak ditemukan', 404);
  }
  const me = pemesan[0];
  if (me.terverifikasi === 0) {
    throw errStatus('Verifikasi akun Anda terlebih dahulu.', 403);
  }
  if (['perwakilan', 'sahabat_baitullah'].includes(me.role) && me.status !== 'active') {
    throw errStatus('Akun Anda belum dikonfirmasi admin. Anda belum bisa melakukan order jamaah.', 403);
  }
  return me;
}

/**
 * Buat 1 booking: hitung harga (termasuk gerbang harga reseller perwakilan
 * berjenjang & harga custom admin), insert booking+payment DP, update seat
 * program. Voucher SENGAJA tidak ditangani di sini — voucher_kode_final &
 * voucher_nominal diterima sudah final (divalidasi di pemanggil kalau perlu),
 * supaya fungsi ini tetap simpel dipakai keranjang multi-item yang belum
 * perlu dukung voucher.
 *
 * @throws {Error} dengan .status (400/404) untuk kondisi gagal (seat penuh dst)
 */
export async function buatSatuBooking(conn, params) {
  const {
    user_id, prog_id, paket, kamar, jumlah_jamaah, namas, was, jks, alamats,
    kode_unik_dp, sumber_info, referral_kode, batch_id,
    referral_perw_id, referral_sahabat_id, ordered_by, ordered_by_role,
    bukti_path, bukti_nama, harga_custom_per_jamaah,
    voucher_kode_final = null, voucher_nominal = 0,
    opsi_tambahan_ids = [],
    meRole, customHotel,
  } = params;

  if (!user_id || !prog_id || !paket) {
    throw errStatus('Field wajib tidak lengkap', 400);
  }

  // Jamaah Sahabat Baitullah yang checkout buat DIRINYA SENDIRI (bukan
  // dipilih orang lain lewat dropdown "sahabat_baitullah" di checkout — itu udah
  // kekirim eksplisit di referral_sahabat_id, jadi kondisi ini gak
  // ke-trigger) otomatis atribusi ke Head of Program, bukan ke diri
  // sendiri atau kosong. Titik ini yang bikin komisi closing-langsung
  // (persentase, lihat src/lib/closing.js::prosesBookingSelesai) otomatis
  // cair ke Head of Program pas booking-nya selesai — gak ada kode
  // tambahan yang perlu disentuh di closing.js.
  let referralSahabatFinal = referral_sahabat_id || null;
  if (!referralSahabatFinal && meRole === 'sahabat_baitullah') {
    const [[pengHop]] = await conn.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
    referralSahabatFinal = pengHop?.head_of_program_user_id || null;
  }

  // Nama tiap jamaah wajib diisi di step pilih paket — jumlahnya harus
  // pas sama jumlah_jamaah item ini, supaya bisa langsung dipakai nyeed
  // jamaah_data (form-jamaah nanti otomatis prefill field "Nama" dari sini).
  const jamaahCount = jumlah_jamaah || 1;
  const namaList = Array.isArray(namas) ? namas.map(n => String(n || '').trim()).filter(Boolean) : [];
  if (namaList.length !== jamaahCount) {
    throw errStatus('Nama lengkap jamaah wajib diisi untuk semua jamaah', 400);
  }
  // Jenis Kelamin wajib diisi PAS BOOKING (bukan nunggu form-jamaah nanti) —
  // biar dari awal udah bisa dipakai buat perencanaan kamar (Realisasi Costing
  // & algoritma alokasi kamar butuh ini dari sisi non-mahram). Divalidasi
  // sama ketatnya kayak nama: jumlahnya harus pas & isinya harus salah satu
  // dari 2 opsi yang valid, gak boleh kosong.
  const jkListRaw = Array.isArray(jks) ? jks.map(j => String(j || '').trim()) : [];
  if (jkListRaw.length !== jamaahCount || jkListRaw.some(j => j !== 'Laki-Laki' && j !== 'Perempuan')) {
    throw errStatus('Jenis kelamin wajib diisi untuk semua jamaah', 400);
  }
  // Alamat kirim perlengkapan (koper/ihrom/mukena dll) — wajib diisi PAS
  // BOOKING (bukan nunggu form-jamaah), soalnya WMS perlengkapan butuh alamat
  // begitu DP confirmed. Bisa diedit lagi nanti di form-jamaah kalau berubah.
  const alamatList = Array.isArray(alamats) ? alamats.map(a => String(a || '').trim()) : [];
  if (alamatList.length !== jamaahCount || alamatList.some(a => !a)) {
    throw errStatus('Alamat kirim perlengkapan wajib diisi untuk semua jamaah', 400);
  }

  const [progs] = await conn.query('SELECT * FROM programs WHERE id = ?', [prog_id]);
  if (progs.length === 0) {
    throw errStatus('Program tidak ditemukan', 404);
  }
  const prog = progs[0];
  const isAdminBooking = meRole === 'admin' || meRole === 'super_admin';

  // Referral perwakilan permanen (dikunci sejak registrasi, lihat kolom
  // users.perekrut_perwakilan_jamaah_id) — HANYA berlaku utk booking
  // self-checkout jamaah (bukan booking admin, yang tetap boleh override
  // manual lewat PATCH /api/bookings/[id]). Server TIDAK PERNAH percaya
  // referral_perw_id dari client kalau pemilik booking statusnya jamaah,
  // soalnya field ini JUGA menentukan harga jual reseller (perwakilan_harga)
  // di bawah, bukan cuma atribusi ujroh — kalau cuma dibenerin pas closing,
  // harga yang ditagih ke jamaah bisa gak konsisten sama siapa yang
  // akhirnya dapat ujroh.
  const [[pemilikBooking]] = await conn.query(
    'SELECT role, perekrut_perwakilan_jamaah_id FROM users WHERE id = ?', [user_id]
  );
  let referralPerwIdFinal = referral_perw_id || null;
  if (!isAdminBooking && pemilikBooking?.role === 'jamaah') {
    referralPerwIdFinal = pemilikBooking.perekrut_perwakilan_jamaah_id || null;
  }

  // 'private' = admin ATAU akun jamaah yang ditunjuk admin di
  // program_private_akun (dikonfirmasi user 2026-09-06 — sebelumnya blanket
  // admin-only, gak ada jalur self-checkout sama sekali). 'perwakilan' = cuma
  // perwakilan yang diotorisasi di program_perwakilan (atau admin) yang boleh
  // closing — gerbang server-side ini yang sebelumnya gak ada sama sekali
  // (listing aja yang nyaring, gampang di-bypass kalau tau prog_id-nya).
  if (prog.publish_type === 'private' && !isAdminBooking) {
    const [otorisasiPrivate] = await conn.query(
      'SELECT 1 FROM program_private_akun WHERE program_id = ? AND user_id = ?',
      [prog_id, user_id]
    );
    if (otorisasiPrivate.length === 0) {
      throw errStatus('Program ini khusus didaftarkan oleh admin atau akun yang ditunjuk.', 403);
    }
  }
  if (prog.publish_type === 'perwakilan' && !isAdminBooking) {
    const [otorisasi] = await conn.query(
      'SELECT 1 FROM program_perwakilan WHERE program_id = ? AND perw_id = ?',
      [prog_id, referralPerwIdFinal || '']
    );
    if (otorisasi.length === 0) {
      throw errStatus('Program ini khusus untuk perwakilan tertentu — Anda tidak berwenang closing program ini.', 403);
    }
  }
  // 'sahabat_baitullah' = Program Sahabat Baitullah, exclusive buat Jamaah Sahabat
  // Baitullah checkout ATAS NAMA DIRI SENDIRI — beda branding & perlengkapan
  // dari program publik, gak boleh dipakein buat closing-in jamaah lain
  // (dikonfirmasi user 2026-08-29). `ordered_by` cuma keisi kalau lewat
  // /order-jamaah (checkout normal gak pernah kirim ini) — beda dari
  // `user_id` berarti dipesenin buat orang lain. Role-check ditambahkan
  // (sebelumnya cuma cek ordered_by) — tanpa ini, jamaah non-sahabat bisa
  // lolos booking program sahabat lewat /api/bookings/batch langsung kalau
  // tau prog_id-nya, walau gak pernah muncul di listing.
  if (prog.publish_type === 'sahabat_baitullah' && !isAdminBooking) {
    if (pemilikBooking?.role !== 'sahabat_baitullah') {
      throw errStatus('Program ini cuma bisa dipesan oleh Jamaah Sahabat Baitullah.', 403);
    }
    if (ordered_by && String(ordered_by) !== String(user_id)) {
      throw errStatus('Program ini cuma bisa dipesan buat diri sendiri.', 403);
    }
  }
  if (prog.used_seat + (jumlah_jamaah || 1) > prog.total_seat) {
    throw errStatus('Seat tidak cukup', 400);
  }

  const kamarKey = kamar?.includes('Quad') ? 'quad' : kamar?.includes('Double') ? 'double' : 'triple';
  let hargaPerJamaah;
  let hotelCustomNama = null;

  if (paket === 'custom') {
    // Custom Hotel per Kota — harga TIDAK PERNAH dipercaya dari client
    // (bukan lewat harga_custom_per_jamaah yang admin-only itu), dihitung
    // ULANG di server dari Bintang Mekkah/Madinah yang dikirim, fungsi SAMA
    // PERSIS dipakai preview /api/programs/[id]/hitung-hotel-custom —
    // mencegah manipulasi harga lewat DevTools. Reseller berjenjang & harga
    // custom admin (jalur di bawah) SENGAJA gak berlaku di sini — belum ada
    // model harga reseller per kombinasi custom, di luar scope sekarang.
    if (!customHotel || !customHotel.mekkahPaket || !customHotel.madinahPaket) {
      throw errStatus('Pilihan Bintang Mekkah/Madinah belum lengkap', 400);
    }
    const hasilCustom = await hitungHargaCustomHotelDenganDb(conn, prog_id, customHotel);
    hargaPerJamaah = hasilCustom.perKamar[kamarKey];
    hotelCustomNama = { bintang_mekkah: hasilCustom.bintangMekkah, bintang_madinah: hasilCustom.bintangMadinah };
  } else {
    hargaPerJamaah = prog[`harga_${paket}_${kamarKey}`] || prog[`harga_${paket}`] || 0;

    // Kalau checkout lewat referral perwakilan, pakai harga jual perwakilan (kalau sudah diatur)
    if (referralPerwIdFinal) {
      const [phRows] = await conn.query(
        'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?',
        [referralPerwIdFinal, prog_id]
      );
      if (phRows.length > 0) {
        const jualPerw = phRows[0][`jual_${paket}_${kamarKey}`];
        if (jualPerw && Number(jualPerw) > 0) {
          hargaPerJamaah = Number(jualPerw);
        }
      }

      // Gerbang reseller berjenjang: kalau perwakilan ini direkrut agen/perwakilan
      // lain, perekrutnya WAJIB sudah pasang harga reseller utk kombinasi ini
      // dulu sebelum closing bisa jalan — kalau belum, margin reseller upline
      // tidak akan pernah tercatat.
      const [perwRows] = await conn.query('SELECT perekrut_id FROM users WHERE id = ?', [referralPerwIdFinal]);
      const perekrutId = perwRows[0]?.perekrut_id;
      if (perekrutId) {
        const [perekrutRows] = await conn.query('SELECT role FROM users WHERE id = ?', [perekrutId]);
        const perekrutRole = perekrutRows[0]?.role;
        if (perekrutRole === 'perwakilan') {
          const [uplineHarga] = await conn.query(
            'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?',
            [perekrutId, prog_id]
          );
          const hargaUpline = uplineHarga[0]?.[`jual_${paket}_${kamarKey}`];
          if (!hargaUpline || Number(hargaUpline) <= 0) {
            throw errStatus('Upline Anda belum mengatur harga reseller untuk program ini. Hubungi upline Anda terlebih dahulu.', 400);
          }
        }
      }
    }

    // Admin (termasuk super_admin) bebas menentukan harga sendiri untuk order direct/kantor
    if ((meRole === 'admin' || meRole === 'super_admin') && Number(harga_custom_per_jamaah) > 0) {
      hargaPerJamaah = Number(harga_custom_per_jamaah);
    }
  }

  // Opsi tambahan (upgrade kamar, request khusus, dst) — ambil harga resmi
  // dari DB (bukan percaya nilai dari client), dikali jumlah_jamaah item ini,
  // dan disnapshot ke booking supaya kalau harga di master berubah nanti,
  // booking lama tetap nunjukin harga waktu dipesan.
  let opsiTambahanSnapshot = [];
  let opsiTambahanTotal = 0;
  if (Array.isArray(opsi_tambahan_ids) && opsi_tambahan_ids.length > 0) {
    const [opsiRows] = await conn.query('SELECT id, nama, harga FROM opsi_tambahan WHERE id IN (?)', [opsi_tambahan_ids]);
    opsiTambahanSnapshot = opsiRows;
    opsiTambahanTotal = opsiRows.reduce((s, o) => s + Number(o.harga), 0) * jamaahCount;
  }

  const totalHarga = hargaPerJamaah * (jumlah_jamaah || 1) + opsiTambahanTotal;
  const dpAmount = prog.dp * (jumlah_jamaah || 1);
  const totalSetelahVoucher = Math.max(0, totalHarga - (voucher_nominal || 0));

  const bookingId = generateBookingId();

  // Seed jamaah_data dengan nama + WA (kalau diisi pas pilih paket) — form-jamaah
  // nanti me-merge field lain di atas objek ini per index, jadi field "Nama"/"WA"
  // otomatis keisi tanpa perlu logic tambahan di sisi form-jamaah. WA opsional
  // tapi krusial buat jamaah yang gak bikin akun sendiri (dipesankan admin/agen)
  // — tanpa ini admin gak punya kontak buat kirim info status via WhatsApp.
  // paket/kamar/harga_jual disnapshot ke tiap entry sejak awal (bukan cuma
  // di kolom booking-level) — dari sini booking baru langsung "lengkap",
  // siap diedit per-orang belakangan tanpa perlu fallback/backfill (lihat
  // src/lib/jamaahHarga.js#resolveJamaahHarga).
  const waList = Array.isArray(was) ? was.map(w => String(w || '').trim()) : [];
  const jamaahDataAwal = JSON.stringify(namaList.map((nama, i) => ({
    nama, wa: waList[i] || '', jk: jkListRaw[i], alamat_kirim: alamatList[i],
    paket, kamar: kamar || 'Triple', harga_jual: hargaPerJamaah,
    ...(hotelCustomNama ? { hotel_custom: hotelCustomNama } : {}),
  })));

  await conn.query(
    `INSERT INTO bookings
    (id, user_id, prog_id, prog_name, paket, kamar, jumlah_jamaah, jamaah_data,
    dp_amount, kode_unik_dp, total_harga, voucher_kode, voucher_nominal, form_total,
    sumber_info, referral_kode, referral_perw_id, referral_sahabat_id,
    ordered_by, ordered_by_role, opsi_tambahan_data, opsi_tambahan_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [bookingId, user_id, prog_id, prog.name, paket, kamar||'Triple',
    jumlah_jamaah||1, jamaahDataAwal, dpAmount, kode_unik_dp||0, totalSetelahVoucher,
    voucher_kode_final, voucher_nominal || 0,
    jumlah_jamaah||1, sumber_info||null, referral_kode||null,
    referralPerwIdFinal||null, referralSahabatFinal,
    ordered_by||user_id, ordered_by_role||'jamaah',
    JSON.stringify(opsiTambahanSnapshot), opsiTambahanTotal]
  );

  // Kuota voucher DIPAKAI di luar sini (lihat src/lib/voucher.js#pakaiVoucher)
  // — caller yang tentukan berapa kali consume-nya (batch: sekali per submit,
  // bukan sekali per item), fungsi ini cuma nyimpen voucher_kode/nominal ke
  // baris booking untuk keperluan audit.

  await conn.query(
    'UPDATE programs SET used_seat = used_seat + ? WHERE id = ?',
    [jumlah_jamaah || 1, prog_id]
  );

  // batch_id nyatuin payment2 yang lahir dari 1x submit keranjang (banyak
  // booking, tapi 1x transfer beneran & 1x bukti diupload) — dipakai admin
  // Payments tab buat nampilin & approve/tolak sekaligus, bukan kartu
  // terpisah per booking yang bukti transfernya keliatan berulang-ulang
  // padahal file-nya sama persis (dikonfirmasi user 2026-07-28: bikin admin
  // gampang lengah pas ngecek satu-satu).
  await conn.query(
    `INSERT INTO payments (booking_id, batch_id, user_id, type, amount, kode_unik, bukti_path, bukti_nama, bukti_uploaded_at)
    VALUES (?,?,?,?,?,?,?,?,NOW())`,
    [bookingId, batch_id || null, user_id, 'dp', dpAmount + (kode_unik_dp||0), kode_unik_dp||0, bukti_path||null, bukti_nama||null]
  );

  return { bookingId, dpAmount, totalHarga: totalSetelahVoucher };
}
