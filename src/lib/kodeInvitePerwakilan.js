// Kode undangan rekrut-perwakilan-baru — random, TERPISAH dari kode_unik
// (yang sekuensial/predictable). Dipakai sebagai gerbang wajib pas
// pendaftaran akun Perwakilan baru lewat /register (dikonfirmasi user
// 2026-09-03) — lihat migration-kode-invite-perwakilan.sql.
//
// Alfabet sengaja buang karakter ambigu (0/O, 1/I/L) biar gak ketuker
// kalau perwakilan dikte-in kodenya lewat WA/telepon ke calon rekrutan.
const ALFABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PANJANG = 7;

function acakSatuKode() {
  let kode = '';
  for (let i = 0; i < PANJANG; i++) {
    kode += ALFABET[Math.floor(Math.random() * ALFABET.length)];
  }
  return kode;
}

// Generate 1 kode unik & simpan ke kolom `kolom` punya user_id yang dikasih.
// Generik (dipakai perwakilan MAUPUN sahabat, lihat wrapper di bawah) —
// SELALU no-op kalau user itu udah punya kode (COALESCE-style, jangan
// pernah menimpa kode yang udah pernah dibagikan ke orang).
async function pastikanKodeInvite(conn, userId, kolom) {
  const [[row]] = await conn.query(`SELECT ${kolom} AS kode FROM users WHERE id = ?`, [userId]);
  if (row?.kode) return row.kode;

  for (let percobaan = 0; percobaan < 10; percobaan++) {
    const kode = acakSatuKode();
    try {
      const [hasil] = await conn.query(
        `UPDATE users SET ${kolom} = ? WHERE id = ? AND ${kolom} IS NULL`,
        [kode, userId]
      );
      if (hasil.affectedRows > 0) return kode;
      // Kalau affectedRows 0, kemungkinan udah keisi barusan (race) — cek ulang.
      const [[cek]] = await conn.query(`SELECT ${kolom} AS kode FROM users WHERE id = ?`, [userId]);
      if (cek?.kode) return cek.kode;
    } catch (e) {
      // Duplicate key (kode udah dipakai user lain) — coba lagi dengan kode baru.
      if (e.code !== 'ER_DUP_ENTRY') throw e;
    }
  }
  throw new Error(`Gagal generate ${kolom} setelah beberapa percobaan`);
}

// Dipanggil dari 2 jalur approve perwakilan (status-pendaftaran & admin/users).
export async function pastikanKodeInvitePerwakilan(conn, userId) {
  return pastikanKodeInvite(conn, userId, 'kode_invite_perwakilan');
}

// Dipanggil dari jalur approve sahabat (status-pendaftaran-sahabat) —
// mirror persis perwakilan, dikonfirmasi user 2026-09-03: referral
// rekrut-sahabat-baru dikunci pakai kode invite acak, bukan dropdown bebas.
export async function pastikanKodeInviteSahabat(conn, userId) {
  return pastikanKodeInvite(conn, userId, 'kode_invite_sahabat');
}
