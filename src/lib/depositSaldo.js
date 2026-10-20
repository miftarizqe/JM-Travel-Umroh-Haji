// Saldo Deposit umum (dikonfirmasi user 2026-10-20) — ledger terpisah dari
// komisi_ledger/saldoSahabat.js, BUKAN komisi dan BUKAN terikat rekening
// BSI mana pun. Sumbernya DP booking program reguler yang hangus karena
// pembatalan atas kemauan jamaah sendiri (bukan kesalahan JM Travel),
// dikonversi jadi saldo alih-alih ditransfer tunai. GAK ADA KEDALUARSA,
// BISA DIPAKAI ATAS NAMA SIAPA SAJA (booking buat orang lain) — kekunci ke
// AKUN yang pegang saldonya, bukan ke identitas jamaah yang namanya nanti
// dipakai di booking baru.
const errStatus = (message, status) => Object.assign(new Error(message), { status });

export async function saldoDeposit(conn, userId) {
  const [[r]] = await conn.query(
    'SELECT COALESCE(SUM(nominal), 0) AS saldo FROM deposit_saldo_ledger WHERE user_id = ?',
    [userId]
  );
  return Number(r?.saldo || 0);
}

// Kredit saldo — dipanggil pas admin approve pembatalan dengan metode
// 'saldo_deposit' (lihat eksekusiPembatalan di /api/pembatalan/route.js).
export async function kreditSaldoDeposit(conn, { userId, bookingIdAsal, nominal, keterangan, dibuatOleh }) {
  if (!userId || nominal <= 0) return;
  await conn.query(
    `INSERT INTO deposit_saldo_ledger (user_id, booking_id_asal, nominal, jenis, keterangan, dibuat_oleh)
     VALUES (?, ?, ?, 'konversi_dp_batal', ?, ?)`,
    [userId, bookingIdAsal || null, nominal, keterangan || null, dibuatOleh || null]
  );
}

// Potong saldo — dipanggil pas jamaah pakai saldo buat bayar DP booking
// BARU (lihat /api/bookings/[id]/bayar-dp-saldo). Throw kalau saldo gak
// cukup — caller WAJIB panggil ini di dalam transaksi SEBELUM mutasi lain
// (kuota seat, status payment, dst) biar gagal bersih.
export async function potongSaldoDeposit(conn, { userId, bookingIdPakai, nominal, keterangan }) {
  if (nominal <= 0) return;
  const saldo = await saldoDeposit(conn, userId);
  if (nominal > saldo) {
    throw errStatus(`Saldo deposit tidak cukup (tersedia Rp ${saldo.toLocaleString('id-ID')}, butuh Rp ${nominal.toLocaleString('id-ID')}).`, 400);
  }
  await conn.query(
    `INSERT INTO deposit_saldo_ledger (user_id, booking_id_pakai, nominal, jenis, keterangan)
     VALUES (?, ?, ?, 'pemakaian', ?)`,
    [userId, bookingIdPakai || null, -nominal, keterangan || null]
  );
}

// Koreksi manual admin (saldo salah input, dsb) — WAJIB keterangan, dicatat
// audit terpisah oleh caller (mirror catatPerubahanSaldo di saldoSahabat.js).
export async function koreksiSaldoDeposit(conn, { userId, nominal, keterangan, dibuatOleh }) {
  if (!userId || !nominal) return;
  await conn.query(
    `INSERT INTO deposit_saldo_ledger (user_id, nominal, jenis, keterangan, dibuat_oleh)
     VALUES (?, ?, 'koreksi_admin', ?, ?)`,
    [userId, nominal, keterangan || null, dibuatOleh || null]
  );
}
