import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { cekPemesanBolehOrder, buatSatuBooking, cariNikDipakaiProgramLain, potongKuotaSeatDp } from '@/lib/booking';
import { cariVoucherValid, hitungPotonganItem, pakaiVoucher } from '@/lib/voucher';
import { cekDanFinalisasiLunasSahabat } from '@/lib/pembayaranSahabatMandiri';
import { saldoSahabat } from '@/lib/saldoSahabat';

// POST /api/sahabat/checkout-mandiri — checkout Program Sahabat Baitullah
// (publish_type='sahabat_baitullah') buat DIRI SENDIRI. Beda dari
// /api/bookings biasa: gak ada tahap DP terpisah — langsung diarahkan ke
// lunas, dibayar SELURUHNYA dari saldo tabungan umroh (dikonfirmasi user
// 2026-09-29 — bukan lagi mix saldo+transfer pribadi ke rekening PT
// Alkhalid, itu keliru: kalau saldo dari ujroh belum cukup, jamaah nabung
// sendiri ke rekening tabungan umroh MEREKA SENDIRI [no_rekening_tabungan_
// umroh, hasil blokir BSI], admin cek mutasi & catat via
// /api/admin/sahabat/setoran-mandiri — itu OTOMATIS nambah saldo_tabungan_
// umroh yang dipakai di sini, bukan jalur pembayaran terpisah per-booking).
// Checkout ditolak total kalau saldo belum cukup — TIDAK ADA lagi opsi
// upload bukti transfer buat nutup selisihnya. Booking baru beneran "paid"
// begitu pemakaian saldo di-acc admin — lihat cekDanFinalisasiLunasSahabat
// di src/lib/pembayaranSahabatMandiri.js.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const me = await cekPemesanBolehOrder(pool, auth.user.id);
    if (me.role !== 'sahabat_baitullah') {
      return Response.json({ error: 'Endpoint ini khusus Jamaah Sahabat Baitullah' }, { status: 403 });
    }

    const body = await request.json();
    const { prog_id, paket, kamar, nama, wa, jk, alamat, voucher_kode, opsi_tambahan_ids, password, nik, tanpa_nik } = body;

    // Wajib konfirmasi password akun sebelum saldo dipotong (dikonfirmasi
    // user 2026-10-11) — sama kayak bayar DP dari saldo di /api/bookings/batch.
    if (!password) {
      return Response.json({ error: 'Masukkan password akun Anda untuk konfirmasi pembayaran dari saldo.' }, { status: 400 });
    }
    const [[pw]] = await pool.query('SELECT password FROM users WHERE id = ?', [auth.user.id]);
    if (!pw || !(await bcrypt.compare(String(password).trim(), pw.password))) {
      return Response.json({ error: 'Password salah.' }, { status: 401 });
    }

    const [progs] = await pool.query('SELECT * FROM programs WHERE id = ?', [prog_id]);
    const prog = progs[0];
    if (!prog) return Response.json({ error: 'Program tidak ditemukan' }, { status: 404 });
    if (prog.publish_type !== 'sahabat_baitullah') {
      return Response.json({ error: 'Program ini bukan Program Sahabat Baitullah — pakai jalur checkout biasa.' }, { status: 400 });
    }

    // Booking di program eksklusif yang sama (dikonfirmasi user 2026-10-12,
    // revisi aturan 2026-10-06 "max 1 booking aktif"): booking yang SUDAH
    // LUNAS gak menghalangi checkout lagi — yang menghalangi cuma booking
    // aktif yang BELUM lunas. Orang yang sama tetap gak boleh terdaftar dua
    // kali (dicek pakai nama di bawah, setelah namaFinal ketemu).
    // menunggu_batal tetap dihitung aktif (pembatalannya belum final).
    const [bookingSamaProgram] = await pool.query(
      `SELECT id, pelunasan_status, jamaah_data FROM bookings
       WHERE user_id = ? AND prog_id = ? AND status IN ('active','menunggu_batal')`,
      [auth.user.id, prog_id]
    );
    const belumLunas = bookingSamaProgram.find(b => b.pelunasan_status !== 'paid');
    if (belumLunas) {
      return Response.json({ error: `Booking Anda sebelumnya di program ini (${belumLunas.id}) belum lunas. Checkout lagi baru bisa setelah booking tersebut lunas atau dibatalkan.` }, { status: 400 });
    }

    // Jalur "daftarin orang lain" cuma buat akun non-Muslim (dikonfirmasi
    // user 2026-10-06, lihat migration 192_referral-nonis-sahabat) — mereka
    // sendiri gak bisa umroh, jadi memberangkatkan orang lain (Muslim) pakai
    // akun/tabungannya. Akun Muslim checkout WAJIB buat diri sendiri — nama
    // dipaksa dari profil akun di server, APAPUN yang dikirim client (field
    // "Nama Lengkap" di UI-nya sendiri udah dikunci, ini lapisan server-side-nya).
    const namaFinal = me.agama === 'non_islam' ? String(nama || '').trim() : me.name;
    if (!namaFinal) return Response.json({ error: 'Nama jamaah wajib diisi' }, { status: 400 });

    // Orang yang sama gak boleh terdaftar dua kali di program yang sama
    // (dikonfirmasi user 2026-10-12) — kunci utamanya NIK. Akun Muslim =
    // diri sendiri, NIK dipaksa dari akun (bukan kiriman client); kalau NIK
    // akunnya kosong, fallback cek nama di booking milik sendiri. Non-Muslim
    // (daftarin orang lain): NIK wajib, kecuali anak belum punya KTP.
    const untukDiriSendiri = me.agama !== 'non_islam';
    let nikFinal = '';
    if (untukDiriSendiri) {
      const [[u]] = await pool.query('SELECT nik FROM users WHERE id = ?', [auth.user.id]);
      nikFinal = String(u?.nik || '').trim();
    } else if (!tanpa_nik) {
      nikFinal = String(nik || '').trim();
      if (!/^\d{16}$/.test(nikFinal)) {
        return Response.json({ error: 'NIK jamaah wajib 16 digit (atau tandai belum punya KTP untuk anak di bawah 17 tahun).' }, { status: 400 });
      }
    }
    if (nikFinal) {
      const dup = await cariNikDipakaiProgramLain(pool, { progId: prog_id, excludeBookingId: '', niks: [nikFinal] });
      if (dup) {
        return Response.json({ error: `NIK ${nikFinal} sudah terdaftar di program ini. Satu orang tidak bisa didaftarkan dua kali di program yang sama.` }, { status: 400 });
      }
    } else if (untukDiriSendiri) {
      const normNama = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const sudahTerdaftar = bookingSamaProgram.find(b => {
        let jd = b.jamaah_data;
        if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch { jd = []; } }
        return Array.isArray(jd) && jd.some(j => j?.status_jamaah !== 'dibatalkan' && normNama(j?.nama) === normNama(namaFinal));
      });
      if (sudahTerdaftar) {
        return Response.json({ error: `Anda sudah terdaftar di program ini (booking ${sudahTerdaftar.id}). Satu orang tidak bisa didaftarkan dua kali di program yang sama.` }, { status: 400 });
      }
    }

    // Voucher — pola sama persis POST /api/bookings, gak percaya nominal dari
    // client, dihitung ulang server-side.
    let voucherNominal = 0;
    let voucherKodeFinal = null;
    if (voucher_kode) {
      const voucher = await cariVoucherValid(pool, voucher_kode, prog_id, auth.user, 1);
      voucherNominal = await hitungPotonganItem(pool, prog, voucher, { paket, kamar, jumlah_jamaah: 1 }, null);
      voucherKodeFinal = voucher.kode;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Kunci baris user ini SEBELUM baca saldo (dikonfirmasi user
      // 2026-10-11) — tanpa ini, 2 checkout bersamaan (double-klik, 2 tab,
      // atau race sama admin yang lagi unconfirm baris komisi di saat yang
      // sama) bisa dua-duanya baca saldo SEBELUM salah satu sempat insert
      // hold-nya, dua-duanya lolos cek "cukup", saldo jadi oversubscribe.
      // FOR UPDATE nahan transaksi LAIN yang juga coba ngunci baris user
      // yang sama (lihat lock sejenis di
      // /api/admin/sahabat/komisi/[id]/route.js) sampai transaksi ini
      // commit/rollback — gak berpengaruh ke user LAIN, cuma serialize
      // operasi-operasi yang sama-sama nyentuh saldo akun ini.
      await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [auth.user.id]);

      // Saldo tersedia — pakai fungsi pusat saldoSahabat() (dipakai sama di
      // /api/sahabat/dashboard, dll) biar gak ada lagi query duplikat yang
      // gampang ketinggalan sinkron (bug 2026-09-29: 'setoran_mandiri_sahabat'
      // sempat ketinggalan dari daftar jenis di sini doang). Pemakaian saldo
      // checkout sebelumnya (confirmed MAUPUN masih pending hold) otomatis
      // ikut kepotong lewat fungsi ini (lihat komentar di saldoSahabat()).
      const saldoTersedia = await saldoSahabat(conn, auth.user.id);

      const hasil = await buatSatuBooking(conn, {
        user_id: auth.user.id, ordered_by: auth.user.id, ordered_by_role: 'sahabat_baitullah',
        prog_id, paket, kamar, jumlah_jamaah: 1,
        namas: [namaFinal], was: [wa], jks: [jk], alamats: [alamat],
        niks: [nikFinal], untuk_diri_sendiri: untukDiriSendiri,
        voucher_kode_final: voucherKodeFinal, voucher_nominal: voucherNominal,
        opsi_tambahan_ids: opsi_tambahan_ids || [],
        meRole: 'sahabat_baitullah',
      });

      const totalHarga = hasil.totalHarga;
      // Wajib ditutup PENUH dari saldo tabungan umroh — TIDAK ADA lagi
      // opsi transfer pribadi buat nutup selisih (dikonfirmasi user
      // 2026-09-29). Kalau saldo dari ujroh belum cukup, jamaah nabung
      // sendiri ke rekening tabungan umrohnya sendiri dulu (admin catat via
      // setoran-mandiri, otomatis nambah saldoTersedia), baru checkout lagi.
      if (saldoTersedia < totalHarga) {
        throw Object.assign(new Error(
          `Saldo tabungan umroh Anda belum cukup (tersedia Rp${saldoTersedia.toLocaleString('id-ID')} dari Rp${totalHarga.toLocaleString('id-ID')}). ` +
          'Tambah saldo dengan menabung ke rekening tabungan umroh Anda sendiri, lalu tunggu admin memperbarui saldo Anda sebelum checkout lagi.'
        ), { status: 400 });
      }
      const saldoDipakai = totalHarga;

      if (saldoDipakai > 0) {
        await conn.query(
          `INSERT INTO komisi_ledger (booking_id, penerima_id, penerima_nama, jenis, nominal, keterangan)
           VALUES (?, ?, ?, 'pemakaian_saldo_sahabat', ?, ?)`,
          [hasil.bookingId, auth.user.id, auth.user.name, -saldoDipakai, `Pemakaian saldo tabungan untuk booking ${prog.name}`]
        );
      }

      // buatSatuBooking otomatis nyimpen 1 baris payments type='dp' (nominal
      // dpAmount) — gak relevan di jalur ini (gak ada tahap DP terpisah,
      // total_harga PENUH dilunasi dari saldo di atas, gak ada baris
      // payments 'lunas' lagi sama sekali sejak transfer-pribadi dicabut).
      // Nol-in nominalnya (bukan cuma confirm) biar gak KEDOBEL kehitung di
      // generateOrUpdateKwitansi (yang jumlahin payments dp+lunas confirmed).
      await conn.query("UPDATE payments SET status = 'confirmed', amount = 0 WHERE booking_id = ? AND type = 'dp'", [hasil.bookingId]);

      await conn.query(
        "UPDATE bookings SET dp_status = 'confirmed', pelunasan_status = 'pending_confirm' WHERE id = ?",
        [hasil.bookingId]
      );

      // DP di jalur ini LANGSUNG confirmed (gak ada tahap admin approve
      // terpisah buat DP-nya, cuma saldo usage-nya yang di-ACC belakangan)
      // — kuota kursi dipotong di SINI juga, momen yang sama (dikonfirmasi
      // user 2026-10-13, lihat potongKuotaSeatDp). Dalam transaksi yang
      // sama biar kalau kuota ternyata penuh, booking-nya ikut gak jadi
      // dibuat (rollback), sama kayak perilaku lama.
      await potongKuotaSeatDp(conn, hasil.bookingId);

      await conn.commit();

      if (voucherKodeFinal) {
        await pakaiVoucher(pool, voucherKodeFinal, 1);
      }

      // Jaring pengaman buat kasus total_harga 0 (misal voucher nutup penuh)
      // — gak ada baris debit ATAUPUN payment yang perlu di-acc sama sekali,
      // jadi langsung selesaikan di sini juga (no-op aman kalau salah satu
      // masih pending, lihat cekDanFinalisasiLunasSahabat).
      try {
        await cekDanFinalisasiLunasSahabat(pool, hasil.bookingId, auth.user);
      } catch (e) {
        console.error('Gagal cek finalisasi lunas sahabat mandiri pas checkout:', e);
      }

      return Response.json({
        message: 'Pendaftaran berhasil! Menunggu konfirmasi admin.',
        booking_id: hasil.bookingId,
        total_harga: totalHarga,
        saldo_dipakai: saldoDipakai,
      }, { status: 201 });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}
