import { costBasisPerwakilan } from '@/lib/closing';

function errStatus(message, status) {
  return Object.assign(new Error(message), { status });
}

function kamarKeyOf(kamar) {
  const k = String(kamar || '').toLowerCase();
  if (k.includes('quad')) return 'quad';
  if (k.includes('double')) return 'double';
  return 'triple';
}

// Batas potongan voucher = margin pribadi PERWAKILAN yang closing booking ini
// (harga jual perwakilan - cost basis). Kalau booking bukan lewat referral
// perwakilan (direct/jamaah, akses_role 'publik'/'akun'), tidak ada margin
// siapa pun yang perlu dilindungi — diskon dianggap ditanggung perusahaan,
// jadi tidak dibatasi (Infinity).
export async function porsiPribadi(conn, prog, paket, kamar, perwId) {
  if (!perwId) return Infinity;
  const p = String(paket || 'deluxe').toLowerCase();
  const kamarKey = kamarKeyOf(kamar);
  const [ph] = await conn.query(
    'SELECT * FROM perwakilan_harga WHERE perw_id = ? AND prog_id = ?', [perwId, prog.id]
  );
  const hargaJual = Number(
    ph[0]?.[`jual_${p}_${kamarKey}`] || prog[`harga_${p}_${kamarKey}`] || prog[`harga_${p}`] || 0
  );
  const hppKantor = Number(prog[`hpp_${p}_${kamarKey}`] || 0);
  const cost = await costBasisPerwakilan(conn, perwId, prog.id, p, kamarKey, hppKantor);
  return Math.max(0, hargaJual - cost);
}

// Lookup + validasi kelayakan voucher: exists/aktif/expiry/prog-match/akses,
// PLUS kuota — yang sekarang dihitung per HEADCOUNT JAMAAH (bukan per submit/
// booking). `totalJamaahDiminta` = jumlah jamaah gabungan yang mau dipakaikan
// voucher ini (across semua item keranjang), dicek SEKALI di sini terhadap
// sisa kuota — bukan per item, supaya cart 2 item @3 jamaah (total 6) nggak
// lolos begitu saja cuma karena tiap item sendiri-sendiri di bawah kuota.
//
// TIDAK cek cap per-paket (beda-beda tiap item, lihat hitungPotonganItem) dan
// TIDAK consume kuota (itu tanggung jawab caller lewat pakaiVoucher, supaya
// keranjang multi-item consume sesuai jamaahCount asli, bukan flat +1).
//
// `userInfo` = { id, role } dari auth.user (JWT payload sudah punya keduanya).
export async function cariVoucherValid(conn, kode, progId, userInfo, totalJamaahDiminta) {
  const kodeUp = String(kode || '').trim().toUpperCase();
  if (!kodeUp) throw errStatus('Kode voucher wajib diisi', 400);

  const [vs] = await conn.query('SELECT * FROM vouchers WHERE kode = ?', [kodeUp]);
  if (vs.length === 0) throw errStatus('Voucher tidak ditemukan', 404);
  const v = vs[0];

  if (v.aktif === 0) throw errStatus('Voucher tidak aktif', 400);
  if (v.valid_until && new Date(v.valid_until) < new Date(new Date().toDateString())) {
    throw errStatus('Voucher sudah kedaluwarsa', 400);
  }
  if (v.prog_id && v.prog_id !== progId) throw errStatus('Voucher tidak berlaku untuk program ini', 400);

  // Akses — siapa yang boleh pakai (independen dari `tampil`, yang cuma
  // ngatur kemunculan di halaman /voucher — lihat src/app/api/vouchers/saya).
  if (v.akses_role === 'akun' && v.for_user !== userInfo.id) {
    throw errStatus('Voucher ini khusus untuk akun lain.', 400);
  }
  if (v.akses_role === 'perwakilan' && userInfo.role !== 'perwakilan') {
    throw errStatus('Voucher ini khusus untuk perwakilan.', 400);
  }

  // Kuota — headcount jamaah, NULL = tanpa batas (independen dari valid_until,
  // dua-duanya boleh aktif sekaligus, mana yang kena duluan itu yang berlaku).
  if (v.kuota != null) {
    const sisa = Number(v.kuota) - Number(v.terpakai || 0);
    if (Number(totalJamaahDiminta || 0) > sisa) {
      throw errStatus(
        `Kuota voucher tidak cukup. Sisa ${Math.max(0, sisa)} jamaah, Anda minta ${totalJamaahDiminta} jamaah.`,
        400
      );
    }
  }

  return v;
}

// Hitung nominal diskon untuk 1 item {paket, kamar, jumlah_jamaah}, sekaligus
// cek batas cap paket itu (lihat porsiPribadi). Dipanggil per item — cap
// beda-beda tiap paket/kamar, dan perwId dari referral_perw_id booking ini
// (null kalau bukan closing perwakilan, mis. order jamaah langsung).
export async function hitungPotonganItem(conn, prog, voucher, item, perwId) {
  const maksPerJamaah = await porsiPribadi(conn, prog, item.paket, item.kamar, perwId);
  const potonganPerJamaah = Number(voucher.potongan || 0);
  if (potonganPerJamaah > maksPerJamaah) {
    throw errStatus(
      `Diskon melebihi batas untuk paket ${item.paket}. Maksimal Rp ${maksPerJamaah.toLocaleString('id-ID')} per jamaah.`,
      400
    );
  }
  return potonganPerJamaah * (item.jumlah_jamaah || 1);
}

// Consume kuota voucher — panggil PERSIS SEKALI per submit (bukan per item),
// nambah `terpakai` sebesar `jamaahCount` (total headcount jamaah di submit
// itu, bukan flat +1) — konsisten dengan kuota yang sekarang dihitung per
// jamaah, bukan per booking/transaksi.
export async function pakaiVoucher(conn, kode, jamaahCount) {
  if (!kode) return;
  const n = Number(jamaahCount || 0);
  // PENTING: MySQL mengevaluasi assignment SET secara berurutan — `terpakai`
  // di ekspresi `used` di bawah ini SUDAH bernilai baru (pasca `terpakai + ?`
  // yang pertama), bukan nilai lama. Makanya jangan tambah `n` lagi di sini,
  // kalau tidak `used` bisa ke-set 1 sebelum kuota beneran habis.
  await conn.query(
    'UPDATE vouchers SET terpakai = terpakai + ?, used = IF(kuota IS NOT NULL AND terpakai >= kuota, 1, 0) WHERE kode = ?',
    [n, kode]
  );
}
