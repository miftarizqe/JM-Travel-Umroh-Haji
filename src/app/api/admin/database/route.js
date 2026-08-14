import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// "Beneran udah berangkat" HARUS nunggu status booking 'selesai' — itu yang
// cuma dipasang closing (otomatis/manual) setelah tanggal_berangkat lewat DAN
// syarat lain lengkap (lihat src/lib/closing.js). Lunas doang atau tanggal
// keberangkatan belum lewat TETAP "Menunggu Keberangkatan", bukan berangkat.
export function statusJamaah(bookingStatus) {
  if (bookingStatus === 'selesai') return 'Sudah Berangkat';
  if (bookingStatus === 'batal' || bookingStatus === 'dibatalkan') return 'Cancel Program';
  return 'Menunggu Keberangkatan'; // active, menunggu_batal
}

// Database Jamaah TIDAK boleh dibatasi ke users.role='jamaah' — banyak jamaah
// yang berangkat didaftarkan oleh perwakilan lewat /order-jamaah dan
// tidak pernah punya akun sendiri. Sumber kebenarannya adalah jamaah_data
// per booking, baru dicocokkan ke tabel users lewat NIK kalau kebetulan dia
// juga punya akun.
//
// Satu ORANG bisa muncul di banyak booking (umroh berkali-kali) — baris di
// database ini digabung per identitas (1 NIK/paspor = 1 baris), bukan per
// booking, dengan riwayat program disimpan di r.programs untuk drill-down.
// Kunci identitas: NIK kalau ada; kalau kosong (jamaah <=17 tahun, form
// sengaja menonaktifkan NIK — lihat src/app/form-jamaah/page.jsx) pakai No.
// Paspor sebagai gantinya, krn paspor wajib diisi utk SEMUA jamaah tanpa
// syarat umur. Entri tanpa nama/NIK/paspor sama sekali (formulir belum
// diisi) gak bisa dicocokkan ke siapa pun, jadi dibiarkan berdiri sendiri.
export async function ambilJamaah() {
  const [bookings] = await pool.query(
    `SELECT b.id AS booking_id, b.prog_name, b.status AS booking_status, b.jumlah_jamaah,
            b.jamaah_data, b.created_at, u.name AS pemesan_nama, pr.tanggal_berangkat
     FROM bookings b
     LEFT JOIN users u ON u.id = b.user_id
     LEFT JOIN programs pr ON pr.id = b.prog_id
     ORDER BY b.created_at DESC`
  );
  const [userRows] = await pool.query(
    `SELECT nik, kode_unik, status FROM users WHERE role = 'jamaah' AND nik IS NOT NULL`
  );
  const akunByNik = new Map(userRows.map(u => [u.nik, u]));

  const groups = new Map();
  bookings.forEach(b => {
    let jd = b.jamaah_data;
    if (typeof jd === 'string') {
      try { jd = JSON.parse(jd); } catch { jd = null; }
    }
    // Booking yang formulirnya belum diisi tetap dimunculkan (jumlah_jamaah
    // baris kosong) — orangnya sudah "terdaftar umroh" begitu booking dibuat,
    // biar total di Database Jamaah gak diam-diam kehilangan orang yang seatnya
    // sudah dipesan tapi identitasnya belum sempat diisi.
    const entries = Array.isArray(jd) && jd.length > 0 ? jd : Array.from({ length: b.jumlah_jamaah || 1 }, () => ({}));
    entries.forEach((j, idx) => {
      const nik = (j.nik || '').trim();
      const paspor = (j.paspor || '').trim().toLowerCase();
      const key = nik ? `nik:${nik}` : paspor ? `paspor:${paspor}` : `raw:${b.booking_id}:${idx}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ j, b, idx });
    });
  });

  const rows = [];
  for (const entries of groups.values()) {
    // Data kontak (WA/email/alamat/dst) dipakai dari booking TERBARU, krn itu
    // yang paling mungkin masih akurat.
    entries.sort((a, b) => new Date(b.b.created_at) - new Date(a.b.created_at));
    const latest = entries[0].j;
    const akun = latest.nik ? akunByNik.get(latest.nik.trim()) : null;

    const programs = entries.map(({ b }) => ({
      booking_id: b.booking_id,
      prog_name: b.prog_name || '-',
      status_jamaah: statusJamaah(b.booking_status),
      tanggal_berangkat: b.tanggal_berangkat,
      created_at: b.created_at,
    }));

    // Ringkasan status buat kolom & pengelompokan tabel: begitu pernah beneran
    // berangkat sekali aja, dia masuk grup "Sudah Berangkat" selamanya (riwayat
    // lengkapnya tetap kelihatan lewat drill-down programs).
    const sudahBerangkat = programs.some(p => p.status_jamaah === 'Sudah Berangkat');
    const adaMenunggu = programs.some(p => p.status_jamaah === 'Menunggu Keberangkatan');
    const statusRingkasan = sudahBerangkat ? 'Sudah Berangkat' : adaMenunggu ? 'Menunggu Keberangkatan' : 'Cancel Program';

    // Keberangkatan pertama = tanggal_berangkat paling awal di antara semua
    // program dia (bukan tanggal booking dibuat) — kalau program itu belum
    // punya tanggal sama sekali, gak ikut dihitung.
    const tanggalBerangkatValid = programs.map(p => p.tanggal_berangkat).filter(Boolean);
    const keberangkatanPertama = tanggalBerangkatValid.length > 0
      ? tanggalBerangkatValid.reduce((min, t) => new Date(t) < new Date(min) ? t : min)
      : null;

    rows.push({
      name: latest.nama || '(formulir belum diisi)',
      nik: latest.nik || '-',
      paspor: latest.paspor || '-',
      wa: latest.wa || '-',
      email: latest.email || '-',
      jenis_kelamin: latest.jk || '-',
      alamat: latest.alamat || '-',
      pekerjaan: latest.pkj || '-',
      programs,
      jumlah_program: programs.length,
      status_jamaah: statusRingkasan,
      keberangkatan_pertama: keberangkatanPertama,
      pemesan_nama: entries[0].b.pemesan_nama || '-',
      kode_unik: akun?.kode_unik || '-',
      // Formulir lengkap (semua field dari jamaah_data, dari booking terbaru)
      // buat drill-down "klik nama" — dokumen, kontak darurat, mahram, dst.
      formulir: latest,
      // Referensi buat admin edit — booking & index tempat entri TERBARU ini
      // beneran hidup di jamaah_data, biar simpan-ulang gak nimpa jamaah lain
      // di booking yang sama.
      latest_booking_id: entries[0].b.booking_id,
      latest_index: entries[0].idx,
      akun_status: akun ? akun.status : 'Tanpa Akun',
    });
  }
  return rows;
}

// PENTING: perekrutan perwakilan (POST /api/daftar-perwakilan) menulis ke
// agen_pendaftaran dengan role_diajukan='perwakilan' — BUKAN ke tabel
// perwakilan_pendaftaran (tabel itu ternyata gak pernah ditulisi siapa pun,
// nama_lembaga/jenis_lembaga/nama_pj juga gak pernah dikumpulkan formnya).
// Join ke agen_pendaftaran biar pendaftaran_id dkk beneran ketemu —
// sebelumnya join ke tabel yang salah.
async function ambilPerwakilan() {
  const [rows] = await pool.query(
    `SELECT u.id, u.role, u.name, u.kode_unik, u.nik, u.email, u.wa, u.status, u.wilayah,
            u.bank, u.no_rekening, u.nama_pemilik_rekening, u.alamat, u.alamat_ktp, u.alamat_domisili,
            u.foto_ktp_path, u.pekerjaan, u.tempat_lahir, u.nama_ibu,
            u.tanggal_lahir, u.jenis_kelamin, u.kode_pos, u.no_perjanjian_kerjasama,
            p.name AS perekrut_nama, u.created_at,
            ap.id AS pendaftaran_id, ap.jadwal_kunjungan, ap.metode AS pendaftaran_metode
     FROM users u
     LEFT JOIN users p ON p.id = u.perekrut_id
     LEFT JOIN agen_pendaftaran ap ON ap.id = (
       SELECT id FROM agen_pendaftaran WHERE user_id = u.id AND role_diajukan = 'perwakilan' ORDER BY id DESC LIMIT 1
     )
     WHERE u.role = 'perwakilan' ORDER BY u.created_at DESC`
  );
  return rows.map(u => ({
    ...u,
    alamat_ktp: u.alamat_ktp || u.alamat,
    alamat_domisili: u.alamat_domisili || u.alamat,
    formulir: {
      nama: u.name, nik: u.nik, tempat_lahir: u.tempat_lahir, tanggal_lahir: u.tanggal_lahir, jenis_kelamin: u.jenis_kelamin,
      nama_ibu: u.nama_ibu, alamat_ktp: u.alamat_ktp || u.alamat, alamat_domisili: u.alamat_domisili || u.alamat,
      kode_pos: u.kode_pos, wa: u.wa, email: u.email, pekerjaan: u.pekerjaan,
      bank: u.bank, no_rekening: u.no_rekening, nama_pemilik_rekening: u.nama_pemilik_rekening,
      jadwal_kunjungan: u.jadwal_kunjungan, metode: u.pendaftaran_metode,
    },
  }));
}

async function ambilProgram() {
  const [rows] = await pool.query(
    `SELECT name, type, kategori, durasi, tanggal_berangkat, total_seat, used_seat, dp,
            harga_deluxe, harga_eksekutif, harga_signature, active, created_at
     FROM programs ORDER BY created_at DESC`
  );
  return rows;
}

const AMBIL = { jamaah: ambilJamaah, perwakilan: ambilPerwakilan, program: ambilProgram };

// GET /api/admin/database?tipe=jamaah|perwakilan|program
// Dipakai halaman "database" (klik dari stat tile Dashboard admin) —
// daftar penuh, dibaca apa adanya (bukan buat export, lihat /api/admin/export untuk itu).
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const tipe = searchParams.get('tipe');
    const ambil = AMBIL[tipe];
    if (!ambil) {
      return Response.json({ error: 'Tipe tidak dikenal' }, { status: 400 });
    }
    const rows = await ambil();
    return Response.json({ rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
