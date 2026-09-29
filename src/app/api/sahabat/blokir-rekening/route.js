import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';

const MS_PER_HARI = 24 * 60 * 60 * 1000;

// PATCH /api/sahabat/blokir-rekening  (tanpa body — self-service, jamaah
// tinggal klik "Setuju")
// Ini cuma dokumen perjanjian (Surat Pernyataan Kuasa Blokir), bukan
// transaksi bank beneran — tanggal_mulai TIDAK LAGI dipilih bebas oleh
// jamaah (dikonfirmasi user 2026-09-29, sempat dibikin date-picker lalu
// dianggap kebanyakan mikir: "tgl blokir ya tanggal ttd aja gausah ribet")
// — dipakai LANGSUNG tanggal hari ini (tanggal persetujuan), dihitung di
// server pakai WIB.
//
// Nominal juga bukan input bebas (dikonfirmasi user 2026-09-20) —
// diturunkan otomatis dari target tabungan (sahabat_pendaftaran.
// target_estimasi_harga, sudah dikunci sejak wizard daftar-sahabat). TIDAK
// digate ke saldo tabungan aktual jamaah (dikonfirmasi user 2026-09-29) —
// nominal di surat ini emang cuma nominal target program, bukan saldo
// yang harus sudah kekumpul duluan.
//
// Jangka waktu blokir DULU fix 90 hari, sekarang DIHITUNG OTOMATIS dari
// hari ini sampai tanggal keberangkatan program target
// (programs.tanggal_berangkat, via sahabat_pendaftaran.program_id) —
// dikonfirmasi user 2026-09-29: program bisa berangkat jauh di masa
// depan (mis. dipilih September tapi berangkat Maret tahun depan), jadi
// gak masuk akal kalau blokirnya dipatok 90 hari doang gak peduli kapan
// keberangkatannya.
// Dipakai buat isi Surat Pernyataan Kuasa Blokir Rekening (surat_pemblokiran).
// Cuma boleh diisi SEKALI (WHERE nominal_blokir_tabungan IS NULL) — pola
// sama persis /api/sahabat/cif-bsi, biar surat yang sudah
// dibekukan/ditandatangani jangan sampai gak nyambung sama angka yang tercatat.
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const tanggalMulai = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // 'YYYY-MM-DD'

    const [[user]] = await pool.query('SELECT role, nominal_blokir_tabungan FROM users WHERE id = ?', [auth.user.id]);
    if (!user) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    if (user.role !== 'sahabat_baitullah') return Response.json({ error: 'Hanya berlaku untuk akun sahabat' }, { status: 400 });
    if (user.nominal_blokir_tabungan) {
      return Response.json({ error: 'Data blokir sudah diisi sebelumnya. Hubungi admin kalau perlu diubah.' }, { status: 400 });
    }

    const [[pendaftaran]] = await pool.query(
      "SELECT target_estimasi_harga, program_id FROM sahabat_pendaftaran WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [auth.user.id]
    );
    const nominal = Number(pendaftaran?.target_estimasi_harga || 0);
    if (!nominal || nominal <= 0) {
      return Response.json({ error: 'Target Impian belum punya harga (Rp 0), jadi nominal blokir belum bisa dihitung. Hubungi admin JM Travel untuk memperbaiki target Anda.' }, { status: 400 });
    }

    const [[program]] = await pool.query('SELECT tanggal_berangkat FROM programs WHERE id = ?', [pendaftaran?.program_id]);
    if (!program?.tanggal_berangkat) {
      return Response.json({ error: 'Program target belum punya tanggal keberangkatan, jadi jangka waktu blokir belum bisa dihitung. Hubungi admin JM Travel.' }, { status: 400 });
    }

    const berangkat = new Date(program.tanggal_berangkat);
    const jangkaWaktuHari = Math.ceil((berangkat.getTime() - new Date(tanggalMulai).getTime()) / MS_PER_HARI);
    if (!(jangkaWaktuHari > 0)) {
      return Response.json({ error: `Tanggal keberangkatan program (${berangkat.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}) sudah lewat/hari ini, jangka waktu blokir gak bisa dihitung. Hubungi admin JM Travel.` }, { status: 400 });
    }

    await pool.query(
      `UPDATE users SET nominal_blokir_tabungan = ?, jangka_waktu_blokir_hari = ?, tanggal_mulai_blokir = ?
       WHERE id = ? AND nominal_blokir_tabungan IS NULL`,
      [nominal, jangkaWaktuHari, tanggalMulai, auth.user.id]
    );
    return Response.json({ message: 'Data blokir tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
