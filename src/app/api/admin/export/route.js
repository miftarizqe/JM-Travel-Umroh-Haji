import ExcelJS from 'exceljs';
import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { hitungLaporanUjroh } from '@/lib/laporanUjroh';
import { hitungLaporanKeuanganProgram } from '@/lib/laporanKeuangan';

function rangeClause(column, from, to, params) {
  let clause = '';
  if (from) { clause += ` AND ${column} >= ?`; params.push(`${from} 00:00:00`); }
  if (to) { clause += ` AND ${column} <= ?`; params.push(`${to} 23:59:59`); }
  return clause;
}

function parseJamaahData(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return Array.isArray(raw) ? raw : [];
}

async function buildUsers(searchParams) {
  const role = searchParams.get('role');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (role) { where += ' AND u.role = ?'; params.push(role); }
  if (status) { where += ' AND u.status = ?'; params.push(status); }
  where += rangeClause('u.created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT u.name AS nama, u.role, u.email, u.wa, u.nik, u.kode_unik,
            u.status, u.wilayah, u.tanggal_lahir, u.jenis_kelamin, u.alamat, u.kode_pos,
            u.pekerjaan, u.bank, u.no_rekening, u.nama_pemilik_rekening,
            u.points, u.tabungan_bsi,
            p.name AS perekrut, u.reg_status, u.reg_metode, u.created_at AS bergabung
     FROM users u LEFT JOIN users p ON p.id = u.perekrut_id
     ${where} ORDER BY u.created_at DESC`,
    params
  );
  return {
    filename: 'akun',
    columns: [
      { header: 'Nama', key: 'nama', width: 24 },
      { header: 'Role', key: 'role', width: 12 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'WhatsApp', key: 'wa', width: 16 },
      { header: 'NIK', key: 'nik', width: 18 },
      { header: 'Kode Unik', key: 'kode_unik', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Wilayah', key: 'wilayah', width: 16 },
      { header: 'Tanggal Lahir', key: 'tanggal_lahir', width: 14 },
      { header: 'Jenis Kelamin', key: 'jenis_kelamin', width: 12 },
      { header: 'Alamat', key: 'alamat', width: 30 },
      { header: 'Kode Pos', key: 'kode_pos', width: 10 },
      { header: 'Pekerjaan', key: 'pekerjaan', width: 16 },
      { header: 'Bank', key: 'bank', width: 14 },
      { header: 'No. Rekening', key: 'no_rekening', width: 18 },
      { header: 'Nama Pemilik Rekening', key: 'nama_pemilik_rekening', width: 24 },
      { header: 'Points', key: 'points', width: 8 },
      { header: 'Tabungan BSI', key: 'tabungan_bsi', width: 14 },
      { header: 'Perekrut', key: 'perekrut', width: 20 },
      { header: 'Status Pendaftaran', key: 'reg_status', width: 18 },
      { header: 'Metode Daftar', key: 'reg_metode', width: 14 },
      { header: 'Bergabung', key: 'bergabung', width: 18 },
    ],
    rows,
  };
}

async function buildBookings(searchParams) {
  const progId = searchParams.get('prog_id');
  const status = searchParams.get('status');
  const dpStatus = searchParams.get('dp_status');
  const pelunasanStatus = searchParams.get('pelunasan_status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (progId) { where += ' AND b.prog_id = ?'; params.push(progId); }
  if (status) { where += ' AND b.status = ?'; params.push(status); }
  if (dpStatus) { where += ' AND b.dp_status = ?'; params.push(dpStatus); }
  if (pelunasanStatus) { where += ' AND b.pelunasan_status = ?'; params.push(pelunasanStatus); }
  where += rangeClause('b.created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT b.id AS booking_id, b.prog_name, u.name AS pemesan, u.email AS pemesan_email, u.wa AS pemesan_wa,
            b.paket, b.kamar, b.jumlah_jamaah, b.total_harga, b.dp_amount, b.dp_status,
            b.pelunasan_status, b.form_filled, b.form_total, b.sumber_info, b.referral_kode,
            b.voucher_kode, b.voucher_nominal, b.status, b.ordered_by_role, b.created_at AS tanggal_booking
     FROM bookings b LEFT JOIN users u ON u.id = b.user_id
     ${where} ORDER BY b.created_at DESC`,
    params
  );
  return {
    filename: 'booking',
    columns: [
      { header: 'Booking ID', key: 'booking_id', width: 14 },
      { header: 'Program', key: 'prog_name', width: 24 },
      { header: 'Pemesan', key: 'pemesan', width: 20 },
      { header: 'Email Pemesan', key: 'pemesan_email', width: 22 },
      { header: 'WA Pemesan', key: 'pemesan_wa', width: 16 },
      { header: 'Paket', key: 'paket', width: 12 },
      { header: 'Kamar', key: 'kamar', width: 16 },
      { header: 'Jumlah Jamaah', key: 'jumlah_jamaah', width: 12 },
      { header: 'Total Harga', key: 'total_harga', width: 14 },
      { header: 'DP', key: 'dp_amount', width: 12 },
      { header: 'Status DP', key: 'dp_status', width: 12 },
      { header: 'Status Pelunasan', key: 'pelunasan_status', width: 16 },
      { header: 'Form Terisi', key: 'form_filled', width: 10 },
      { header: 'Form Total', key: 'form_total', width: 10 },
      { header: 'Sumber Info', key: 'sumber_info', width: 14 },
      { header: 'Kode Referral', key: 'referral_kode', width: 14 },
      { header: 'Voucher', key: 'voucher_kode', width: 14 },
      { header: 'Nominal Voucher', key: 'voucher_nominal', width: 14 },
      { header: 'Status Booking', key: 'status', width: 14 },
      { header: 'Dipesan Oleh (Role)', key: 'ordered_by_role', width: 16 },
      { header: 'Tanggal Booking', key: 'tanggal_booking', width: 18 },
    ],
    rows,
  };
}

async function buildJamaah(searchParams) {
  const progId = searchParams.get('prog_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE b.jamaah_data IS NOT NULL';
  if (progId) { where += ' AND b.prog_id = ?'; params.push(progId); }
  where += rangeClause('b.created_at', from, to, params);

  const [bookings] = await pool.query(
    `SELECT b.id AS booking_id, b.prog_name, b.jamaah_data, b.created_at
     FROM bookings b ${where} ORDER BY b.created_at DESC`,
    params
  );

  const rows = [];
  for (const b of bookings) {
    const list = parseJamaahData(b.jamaah_data);
    for (const j of list) {
      rows.push({
        booking_id: b.booking_id,
        prog_name: b.prog_name,
        nama: j.nama || '',
        nik: j.nik || '',
        paspor: j.paspor || '',
        exp_mulai: j.exp_mulai || '',
        exp_paspor: j.exp_paspor || '',
        tkp: j.tkp || '',
        tl: j.tl || '',
        ttl: j.ttl || '',
        jk: j.jk || '',
        alamat: j.alamat || '',
        wa: j.wa || '',
        email: j.email || '',
        pkj: j.pkj || '',
        penyakit: j.penyakit || '',
        mahram: j.mahram || '',
        hub_mahram: j.hub_mahram || '',
        kdnama: j.kdnama || '',
        kdwa: j.kdwa || '',
        kdhub: j.kdhub || '',
        tanggal_booking: b.created_at,
      });
    }
  }

  return {
    filename: 'data-jamaah',
    columns: [
      { header: 'Booking ID', key: 'booking_id', width: 14 },
      { header: 'Program', key: 'prog_name', width: 24 },
      { header: 'Nama', key: 'nama', width: 22 },
      { header: 'NIK', key: 'nik', width: 18 },
      { header: 'No. Paspor', key: 'paspor', width: 16 },
      { header: 'Paspor Mulai', key: 'exp_mulai', width: 14 },
      { header: 'Paspor Berakhir', key: 'exp_paspor', width: 14 },
      { header: 'Tempat Keluar Paspor', key: 'tkp', width: 18 },
      { header: 'Tempat Lahir', key: 'tl', width: 16 },
      { header: 'Tanggal Lahir', key: 'ttl', width: 14 },
      { header: 'Jenis Kelamin', key: 'jk', width: 12 },
      { header: 'Alamat', key: 'alamat', width: 28 },
      { header: 'WhatsApp', key: 'wa', width: 16 },
      { header: 'Email', key: 'email', width: 22 },
      { header: 'Pekerjaan', key: 'pkj', width: 16 },
      { header: 'Riwayat Penyakit', key: 'penyakit', width: 18 },
      { header: 'Mahram', key: 'mahram', width: 18 },
      { header: 'Hubungan Mahram', key: 'hub_mahram', width: 16 },
      { header: 'Kontak Darurat', key: 'kdnama', width: 18 },
      { header: 'WA Kontak Darurat', key: 'kdwa', width: 16 },
      { header: 'Hubungan Kontak Darurat', key: 'kdhub', width: 18 },
      { header: 'Tanggal Booking', key: 'tanggal_booking', width: 18 },
    ],
    rows,
  };
}

async function buildPayments(searchParams) {
  const status = searchParams.get('status');
  const type = searchParams.get('ptype');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (type) { where += ' AND type = ?'; params.push(type); }
  where += rangeClause('created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT booking_id, nama, type, amount, kode_unik, status, bukti_nama, reject_reason, created_at
     FROM payments ${where} ORDER BY created_at DESC`,
    params
  );
  return {
    filename: 'pembayaran',
    columns: [
      { header: 'Booking ID', key: 'booking_id', width: 14 },
      { header: 'Nama', key: 'nama', width: 22 },
      { header: 'Jenis', key: 'type', width: 10 },
      { header: 'Jumlah', key: 'amount', width: 14 },
      { header: 'Kode Unik', key: 'kode_unik', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'File Bukti', key: 'bukti_nama', width: 24 },
      { header: 'Alasan Tolak', key: 'reject_reason', width: 24 },
      { header: 'Tanggal', key: 'created_at', width: 18 },
    ],
    rows,
  };
}

async function buildKomisi(searchParams) {
  const jenis = searchParams.get('jenis');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (jenis) { where += ' AND jenis = ?'; params.push(jenis); }
  where += rangeClause('created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT booking_id, penerima_nama, jenis, jumlah_jamaah, nominal, paket, keterangan, created_at
     FROM komisi_ledger ${where} ORDER BY created_at DESC`,
    params
  );
  return {
    filename: 'komisi',
    columns: [
      { header: 'Booking ID', key: 'booking_id', width: 14 },
      { header: 'Penerima', key: 'penerima_nama', width: 22 },
      { header: 'Jenis Komisi', key: 'jenis', width: 20 },
      { header: 'Jumlah Jamaah', key: 'jumlah_jamaah', width: 12 },
      { header: 'Nominal', key: 'nominal', width: 14 },
      { header: 'Paket', key: 'paket', width: 12 },
      { header: 'Keterangan', key: 'keterangan', width: 30 },
      { header: 'Tanggal', key: 'created_at', width: 18 },
    ],
    rows,
  };
}

async function buildCustomHarga(searchParams) {
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (status) { where += ' AND status = ?'; params.push(status); }
  where += rangeClause('created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT pengaju_nama, pengaju_role, prog_name, paket, kamar, harga_diajukan,
            alasan, status, catatan_admin, created_at
     FROM custom_harga_request ${where} ORDER BY created_at DESC`,
    params
  );
  return {
    filename: 'custom-harga',
    columns: [
      { header: 'Pengaju', key: 'pengaju_nama', width: 22 },
      { header: 'Role', key: 'pengaju_role', width: 12 },
      { header: 'Program', key: 'prog_name', width: 24 },
      { header: 'Paket', key: 'paket', width: 12 },
      { header: 'Kamar', key: 'kamar', width: 14 },
      { header: 'Harga Diajukan', key: 'harga_diajukan', width: 14 },
      { header: 'Alasan', key: 'alasan', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Catatan Admin', key: 'catatan_admin', width: 24 },
      { header: 'Tanggal', key: 'created_at', width: 18 },
    ],
    rows,
  };
}

async function buildAudit(searchParams) {
  const targetType = searchParams.get('target_type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (targetType) { where += ' AND target_type = ?'; params.push(targetType); }
  where += rangeClause('created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT actor_nama, aksi, target_type, target_id, keterangan, created_at
     FROM audit_log ${where} ORDER BY created_at DESC`,
    params
  );
  return {
    filename: 'audit-trail',
    columns: [
      { header: 'Admin', key: 'actor_nama', width: 20 },
      { header: 'Aksi', key: 'aksi', width: 20 },
      { header: 'Target Type', key: 'target_type', width: 14 },
      { header: 'Target ID', key: 'target_id', width: 16 },
      { header: 'Keterangan', key: 'keterangan', width: 36 },
      { header: 'Waktu', key: 'created_at', width: 18 },
    ],
    rows,
  };
}

async function buildClosing(searchParams) {
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const [users] = await pool.query(
    `SELECT u.id, u.name, u.role, u.kode_unik, u.status, p.name AS perekrut
     FROM users u LEFT JOIN users p ON p.id = u.perekrut_id
     WHERE u.role = 'perwakilan'`
  );

  const bookingParams = [];
  let bookingWhere = ' WHERE referral_perw_id IS NOT NULL';
  bookingWhere += rangeClause('created_at', from, to, bookingParams);
  const [bookingRows] = await pool.query(
    `SELECT referral_perw_id AS penerima_id,
            COUNT(*) AS jumlah_booking, COALESCE(SUM(jumlah_jamaah),0) AS jumlah_jamaah
     FROM bookings ${bookingWhere} GROUP BY referral_perw_id`,
    bookingParams
  );
  const bookingMap = {};
  bookingRows.forEach(r => { bookingMap[r.penerima_id] = r; });

  const komisiParams = [];
  let komisiWhere = ' WHERE 1=1';
  komisiWhere += rangeClause('created_at', from, to, komisiParams);
  const [komisiRows] = await pool.query(
    `SELECT penerima_id, SUM(nominal) AS total FROM komisi_ledger ${komisiWhere} GROUP BY penerima_id`,
    komisiParams
  );
  const komisiMap = {};
  komisiRows.forEach(r => { komisiMap[r.penerima_id] = Number(r.total); });

  const rows = users
    .map(u => ({
      nama: u.name,
      role: u.role,
      kode_unik: u.kode_unik,
      status: u.status,
      perekrut: u.perekrut || '-',
      jumlah_booking: bookingMap[u.id]?.jumlah_booking || 0,
      jumlah_jamaah: bookingMap[u.id]?.jumlah_jamaah || 0,
      total_komisi: komisiMap[u.id] || 0,
    }))
    .sort((a, b) => b.total_komisi - a.total_komisi);

  return {
    filename: 'laporan-closing',
    columns: [
      { header: 'Nama', key: 'nama', width: 22 },
      { header: 'Role', key: 'role', width: 12 },
      { header: 'Kode Unik', key: 'kode_unik', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Perekrut', key: 'perekrut', width: 22 },
      { header: 'Jumlah Booking', key: 'jumlah_booking', width: 14 },
      { header: 'Jumlah Jamaah', key: 'jumlah_jamaah', width: 14 },
      { header: 'Total Komisi', key: 'total_komisi', width: 16 },
    ],
    rows,
  };
}

async function buildVouchers(searchParams) {
  const aktif = searchParams.get('aktif');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (aktif !== null && aktif !== '') { where += ' AND v.aktif = ?'; params.push(aktif === '1' ? 1 : 0); }
  where += rangeClause('v.created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT v.kode, v.potongan, v.kuota, v.terpakai, v.valid_until, v.aktif,
            p.name AS program, v.catatan, v.created_at
     FROM vouchers v LEFT JOIN programs p ON p.id = v.prog_id
     ${where} ORDER BY v.created_at DESC`,
    params
  );
  return {
    filename: 'voucher',
    columns: [
      { header: 'Kode', key: 'kode', width: 16 },
      { header: 'Potongan', key: 'potongan', width: 14 },
      { header: 'Kuota', key: 'kuota', width: 10 },
      { header: 'Terpakai', key: 'terpakai', width: 10 },
      { header: 'Berlaku Sampai', key: 'valid_until', width: 14 },
      { header: 'Aktif', key: 'aktif', width: 8 },
      { header: 'Program', key: 'program', width: 24 },
      { header: 'Catatan', key: 'catatan', width: 24 },
      { header: 'Dibuat', key: 'created_at', width: 18 },
    ],
    rows,
  };
}

async function buildPrograms(searchParams) {
  const active = searchParams.get('active');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const params = [];
  let where = ' WHERE 1=1';
  if (active !== null && active !== '') { where += ' AND active = ?'; params.push(active === '1' ? 1 : 0); }
  where += rangeClause('created_at', from, to, params);

  const [rows] = await pool.query(
    `SELECT name, type, kategori, durasi, tanggal_berangkat, total_seat, used_seat, dp,
            harga_deluxe, harga_eksekutif, harga_signature,
            hpp_perw, active, created_at
     FROM programs ${where} ORDER BY created_at DESC`,
    params
  );
  return {
    filename: 'program',
    columns: [
      { header: 'Nama', key: 'name', width: 26 },
      { header: 'Tipe', key: 'type', width: 12 },
      { header: 'Kategori', key: 'kategori', width: 14 },
      { header: 'Durasi (hari)', key: 'durasi', width: 12 },
      { header: 'Tanggal Berangkat', key: 'tanggal_berangkat', width: 16 },
      { header: 'Total Seat', key: 'total_seat', width: 10 },
      { header: 'Terpakai', key: 'used_seat', width: 10 },
      { header: 'DP', key: 'dp', width: 12 },
      { header: 'Harga Deluxe', key: 'harga_deluxe', width: 14 },
      { header: 'Harga Eksekutif', key: 'harga_eksekutif', width: 14 },
      { header: 'Harga Signature', key: 'harga_signature', width: 14 },
      { header: 'HPP Perwakilan', key: 'hpp_perw', width: 14 },
      { header: 'Aktif', key: 'active', width: 8 },
      { header: 'Dibuat', key: 'created_at', width: 18 },
    ],
    rows,
  };
}

async function buildLaporanUjroh(searchParams) {
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const { closingRows, forecastRows } = await hitungLaporanUjroh(pool, { from, to });

  return {
    filename: 'laporan-ujroh',
    sheets: [
      {
        name: 'Closing (Sudah Cair)',
        columns: [
          { header: 'Role', key: 'role', width: 12 },
          { header: 'Nama', key: 'nama', width: 22 },
          { header: 'Kode Unik', key: 'kode_unik', width: 14 },
          { header: 'Kategori Rekening', key: 'kategori', width: 16 },
          { header: 'Bank', key: 'bank', width: 14 },
          { header: 'No. Rekening', key: 'no_rekening', width: 18 },
          { header: 'Nama Pemilik Rekening', key: 'nama_pemilik_rekening', width: 24 },
          { header: 'Program', key: 'prog_name', width: 24 },
          { header: 'Jumlah Jamaah', key: 'jumlah_jamaah', width: 12 },
          { header: 'Jenis Ujroh', key: 'jenis', width: 18 },
          { header: 'Booking ID', key: 'booking_id', width: 14 },
          { header: 'Keterangan', key: 'keterangan', width: 30 },
          { header: 'Nominal', key: 'nominal', width: 14 },
          { header: 'Tanggal Cair', key: 'tanggal_cair', width: 18 },
        ],
        rows: closingRows,
      },
      {
        name: 'Forecast (Belum Closing)',
        columns: [
          { header: 'Role', key: 'role', width: 12 },
          { header: 'Nama', key: 'nama', width: 22 },
          { header: 'Kode Unik', key: 'kode_unik', width: 14 },
          { header: 'Jenis Ujroh', key: 'jenis', width: 18 },
          { header: 'Booking ID', key: 'booking_id', width: 14 },
          { header: 'Program', key: 'prog_name', width: 24 },
          { header: 'Jumlah Jamaah', key: 'jumlah_jamaah', width: 12 },
          { header: 'Keterangan', key: 'keterangan', width: 30 },
          { header: 'Potensi Nominal', key: 'nominal', width: 16 },
        ],
        rows: forecastRows,
      },
    ],
  };
}

async function buildLaporanKeuanganProgram(searchParams) {
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const progId = searchParams.get('prog_id');
  const { per_program, per_bulan } = await hitungLaporanKeuanganProgram(pool, { from, to, progId });

  const kolomRingkasan = (labelKolom) => [
    { header: labelKolom, key: 'label', width: 22 },
    { header: 'Jumlah Booking', key: 'jumlah_booking', width: 14 },
    { header: 'Jumlah Jamaah', key: 'jumlah_jamaah', width: 12 },
    { header: 'Pendapatan Program', key: 'pendapatan_program', width: 18 },
    { header: 'Opsi Tambahan', key: 'opsi_tambahan', width: 16 },
    { header: 'Diskon Voucher', key: 'diskon_voucher', width: 16 },
    { header: 'Pendapatan Bersih', key: 'pendapatan_bersih', width: 18 },
    { header: 'HPP', key: 'hpp', width: 16 },
    { header: 'Laba Kotor', key: 'laba_kotor', width: 16 },
    { header: 'Komisi/Ujroh', key: 'komisi', width: 16 },
    { header: 'Laba Bersih', key: 'laba_bersih', width: 16 },
  ];

  return {
    filename: 'laporan-keuangan-program',
    sheets: [
      { name: 'Per Bulan', columns: kolomRingkasan('Bulan'), rows: per_bulan },
      { name: 'Per Program', columns: kolomRingkasan('Program'), rows: per_program },
    ],
  };
}

const BUILDERS = {
  users: buildUsers,
  bookings: buildBookings,
  jamaah: buildJamaah,
  payments: buildPayments,
  komisi: buildKomisi,
  vouchers: buildVouchers,
  programs: buildPrograms,
  customharga: buildCustomHarga,
  audit: buildAudit,
  closing: buildClosing,
  'laporan-ujroh': buildLaporanUjroh,
  'laporan-keuangan-program': buildLaporanKeuanganProgram,
};

// Tipe export yang datanya sensitif (angka keuangan) — super_admin only,
// sama kayak halaman in-app-nya. Sisanya tetap admin biasa.
const TIPE_SUPER_ADMIN_ONLY = ['laporan-keuangan-program'];

// GET /api/admin/export?type=users|bookings|jamaah|payments|komisi|vouchers|programs&...filter
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const builder = BUILDERS[type];
    if (!builder) {
      return Response.json({ error: 'Tipe data tidak dikenal' }, { status: 400 });
    }
    if (TIPE_SUPER_ADMIN_ONLY.includes(type) && auth.user.role !== 'super_admin') {
      return Response.json({ error: 'Akses ditolak. Data ini khusus super admin.' }, { status: 403 });
    }

    const built = await builder(searchParams);
    const { filename } = built;
    // Builder bisa balikin 1 sheet ({columns, rows}) atau beberapa sheet
    // sekaligus ({sheets: [{name, columns, rows}, ...]}) — laporan yang
    // butuh beberapa tabel terpisah (mis. Closing vs Forecast) pakai yang kedua.
    const sheetDefs = built.sheets || [{ name: 'Data', columns: built.columns, rows: built.rows }];

    const workbook = new ExcelJS.Workbook();
    for (const def of sheetDefs) {
      const sheet = workbook.addWorksheet(def.name);
      sheet.columns = def.columns;
      sheet.getRow(1).font = { bold: true };
      def.rows.forEach(r => sheet.addRow(r));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const tanggal = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="jm-travel-${filename}-${tanggal}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Gagal export:', error);
    return Response.json({ error: 'Gagal membuat file export' }, { status: 500 });
  }
}
