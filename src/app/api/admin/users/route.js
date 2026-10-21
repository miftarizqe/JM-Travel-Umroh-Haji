import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';
import { pastikanKodeInvitePerwakilan } from '@/lib/kodeInvitePerwakilan';
import { pastikanKodeUnik } from '@/lib/kodeUnik';
import { statusAkun } from '@/lib/statusAkun';
import { apakahBagianTeamHop } from '@/lib/hopAuth';

// GET — list users, filter opsional by role & status
export async function GET(req) {
  const auth = wajibRole(req, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    // `roles` (CSV, dikonfirmasi user 2026-10-12) -- dipakai picker "Rekrut
    // dari Akun Existing" di /admin/perwakilan (butuh jamaah+sahabat_baitullah
    // sekaligus dalam 1 query). TERPISAH dari `role` tunggal yang udah ada
    // biar caller lama gak kepengaruh.
    const rolesCsv = searchParams.get('roles');
    // `q` -- cari nama/NIK/WA/kode_unik, exact-match-ish via LIKE (dipakai
    // picker yang sama). Cuma relevan kalau dikombinasikan `roles`, tapi
    // gak dipaksa biar fleksibel dipakai sendiri juga ke depannya.
    const q = (searchParams.get('q') || '').trim();

    let query = `
      SELECT u.id, u.name, u.email, u.wa, u.nik, u.role, u.kode_unik, u.status,
             u.wilayah, u.points, u.tabungan_bsi, u.perekrut_id, p.name AS perekrut_nama,
             u.reg_status, u.reg_metode, u.reg_jadwal, u.terverifikasi, u.created_at,
             u.perbaikan_akun_diminta_at, u.perbaikan_akun_catatan,
             ap.id AS pendaftaran_id, ap.status AS pendaftaran_status,
             ap.metode AS pendaftaran_metode
      FROM users u
      LEFT JOIN users p ON p.id = u.perekrut_id
      LEFT JOIN agen_pendaftaran ap ON ap.id = (
        SELECT id FROM agen_pendaftaran WHERE user_id = u.id ORDER BY id DESC LIMIT 1
      )
      WHERE 1=1
    `;
    const params = [];
    // Admin biasa gak boleh lihat akun staff (admin/super_admin) lain sama
    // sekali — dipaksa di server, bukan cuma disembunyikan di UI, biar gak
    // bisa ke-intip lewat DevTools/manipulasi ?role= (dikonfirmasi user
    // 2026-08-21). super_admin tetap bisa lihat semua kayak sebelumnya.
    if (auth.user.role !== 'super_admin') {
      query += " AND u.role NOT IN ('admin','super_admin','hop')";
    }
    if (role) { query += ' AND u.role = ?'; params.push(role); }
    if (rolesCsv) {
      const rolesArr = rolesCsv.split(',').map(r => r.trim()).filter(Boolean);
      if (rolesArr.length > 0) {
        query += ` AND u.role IN (${rolesArr.map(() => '?').join(',')})`;
        params.push(...rolesArr);
        // Yang udah punya role_kedua APAPUN gak perlu nongol lagi di picker
        // (bukan validasi final -- endpoint rekrut_jadi_perwakilan/
        // tambah_role_kedua tetap nolak eksplisit kalau somehow kepilih,
        // ini cuma nyaring hasil pencarian biar gak keliatan "bisa
        // direkrut" padahal udah). Generik (bukan literal != 'perwakilan')
        // dikonfirmasi user 2026-10-19 -- picker ini sekarang dipakai 2 arah
        // (jamaah/sahabat->perwakilan DAN perwakilan->sahabat, lihat
        // admin/sahabat/page.jsx), cuma ada 1 slot role_kedua jadi "udah
        // punya salah satu" = gak eligible buat arah manapun.
        query += ' AND u.role_kedua IS NULL';
      }
    }
    if (status) { query += ' AND u.status = ?'; params.push(status); }
    if (q) {
      query += ' AND (u.name LIKE ? OR u.nik LIKE ? OR u.wa LIKE ? OR u.kode_unik LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    query += ' ORDER BY u.created_at DESC';
    // Picker butuh hasil terbatas & ringan -- q wajib diisi biar gak jadi
    // "tampilin semua jamaah" tanpa sengaja (bisa ribuan baris).
    if (rolesCsv && q) query += ' LIMIT 20';

    const [users] = await db.query(query, params);
    for (const u of users) u.status_akun = statusAkun(u);

    // Picker "Rekrut dari Akun Existing" doang (rolesCsv+q) -- Sahabat
    // Baitullah yang masuk team HoP (downline-nya, rantai perekrut_id)
    // GAK BOLEH direkrut jadi Perwakilan (dikonfirmasi user 2026-10-12).
    // Disaring di sini (bukan cuma di aksi rekrut) biar gak nongol dulu di
    // hasil pencarian terus ternyata ditolak pas diklik -- hemat 1 langkah
    // percuma buat admin. Cuma ngecek baris role='sahabat_baitullah' (hasil
    // udah dibatasi 20 di atas, jadi ringan), jamaah biasa gak kena sama
    // sekali (aturan ini SENGAJA cuma soal Sahabat Baitullah).
    if (rolesCsv && q) {
      const hasil = [];
      for (const u of users) {
        if (u.role === 'sahabat_baitullah' && await apakahBagianTeamHop(db, u.id)) continue;
        hasil.push(u);
      }
      return NextResponse.json({ users: hasil });
    }

    return NextResponse.json({ users });
  } catch (err) {
    console.error('Error fetch users:', err);
    return NextResponse.json({ error: 'Gagal mengambil data' }, { status: 500 });
  }
}

// PATCH — approve / reject / update reg status / set aktif-nonaktif
export async function PATCH(req) {
  const auth = wajibRole(req, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const { user_id, action, reg_status, reject_reason, new_status, fields } = body;
    if (!user_id || !action) {
      return NextResponse.json({ error: 'user_id dan action wajib diisi' }, { status: 400 });
    }

    const [rows] = await db.query('SELECT id, name, role, role_kedua, status, terverifikasi, perekrut_id FROM users WHERE id = ?', [user_id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    const target = rows[0];
    // Defense-in-depth — admin biasa gak boleh ubah akun staff lain, walau
    // id-nya ke-tebak/ke-leak dari tempat lain (lihat guard GET di atas).
    if (['admin', 'super_admin'].includes(target.role) && auth.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Tidak berwenang mengubah akun staff.' }, { status: 403 });
    }
    const roleLabel = { perwakilan: 'Perwakilan', jamaah: 'Jamaah', sahabat_baitullah: 'Jamaah Sahabat Baitullah' }[target.role] || target.role;

    switch (action) {
      case 'approve':
        await db.query("UPDATE users SET status = 'active', reg_status = 'active' WHERE id = ?", [user_id]);

        // Kode undangan rekrut-perwakilan-baru — jalur approve kedua (di
        // luar /api/status-pendaftaran), sama-sama harus generate biar
        // gak ada perwakilan aktif yang kelewat gak punya kode.
        if (target.role === 'perwakilan') {
          await pastikanKodeInvitePerwakilan(db, target.id);
        }
        // Kode unik — baru dijatah SEKARANG, akun beneran aktif
        // (dikonfirmasi user 2026-09-07), bukan pas daftar. No-op kalau
        // udah punya (mis. jamaah yang emang udah aktif dari awal).
        await pastikanKodeUnik(db, target.id, target.role);

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_aktif',
          judul: 'Akun Anda Aktif!',
          pesan: `Selamat, akun ${roleLabel} Anda sudah dikonfirmasi admin. Anda sekarang bisa order jamaah.`,
          link: target.role === 'perwakilan' ? '/dashboard/perwakilan' : target.role === 'sahabat_baitullah' ? '/dashboard/sahabat' : '/dashboard/jamaah',
        });

        if (target.perekrut_id) {
          await kirimNotifikasi(db, {
            user_id: target.perekrut_id,
            tipe: 'downline_baru',
            judul: 'Downline Baru Aktif',
            pesan: `${target.name} baru saja aktif sebagai ${roleLabel} di jaringan Anda.`,
            link: '/dashboard/perwakilan',
          });
        }

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'approve_user',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel})`,
        });

        return NextResponse.json({ message: 'User berhasil diaktifkan!' });

      case 'reject':
        await db.query("UPDATE users SET status = 'rejected' WHERE id = ?", [user_id]);

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_ditolak',
          judul: 'Pendaftaran Ditolak',
          pesan: `Pendaftaran ${roleLabel} Anda ditolak.${reject_reason ? ' Alasan: ' + reject_reason : ''}`,
          link: '/profil',
        });

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'reject_user',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel})${reject_reason ? ': ' + reject_reason : ''}`,
        });

        return NextResponse.json({ message: 'User ditolak.', reason: reject_reason || null });

      // Verifikasi akun baru — pengganti OTP registrasi (2026-09-25).
      // Register sekarang nyimpan terverifikasi = 0; akun belum bisa order
      // atau lanjut daftar perwakilan sampai admin memverifikasi di sini.
      case 'verifikasi_akun': {
        if (target.terverifikasi) {
          return NextResponse.json({ error: 'Akun sudah terverifikasi' }, { status: 400 });
        }
        await db.query('UPDATE users SET terverifikasi = 1, perbaikan_akun_diminta_at = NULL, perbaikan_akun_catatan = NULL WHERE id = ?', [user_id]);

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_terverifikasi',
          judul: 'Akun Anda Terverifikasi',
          pesan: 'Akun Anda sudah diverifikasi admin. Sekarang Anda bisa melanjutkan pendaftaran dan order.',
          link: '/profil',
        });

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'verifikasi_akun',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel})`,
        });

        return NextResponse.json({ message: 'Akun berhasil diverifikasi.' });
      }

      // Tolak tapi user TETAP bisa login & diminta isi ulang form
      // registrasinya (dikonfirmasi user 2026-10-11) — beda dari
      // 'tolak_verifikasi' di bawah yang ngeblok login permanen (buat akun
      // spam/palsu). User kirim perbaikan lewat /perbaiki-data-akun, flag
      // dikosongkan & akun balik ke antrian "Menunggu Verifikasi Akun".
      case 'minta_perbaikan_akun': {
        if (target.terverifikasi) {
          return NextResponse.json({ error: 'Akun sudah terverifikasi' }, { status: 400 });
        }
        if (!reject_reason?.trim()) {
          return NextResponse.json({ error: 'Alasan / data yang perlu diperbaiki wajib diisi' }, { status: 400 });
        }
        await db.query(
          'UPDATE users SET perbaikan_akun_diminta_at = NOW(), perbaikan_akun_catatan = ? WHERE id = ?',
          [reject_reason.trim(), user_id]
        );

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_perlu_perbaikan',
          judul: 'Data Akun Perlu Diperbaiki',
          pesan: `Verifikasi akun Anda ditolak. Alasan: ${reject_reason.trim()}. Silakan perbaiki data akun Anda.`,
          link: '/perbaiki-data-akun',
        });

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'minta_perbaikan_akun',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel}): ${reject_reason.trim()}`,
        });

        return NextResponse.json({ message: 'User diminta memperbaiki data akunnya.' });
      }

      case 'tolak_verifikasi': {
        if (target.terverifikasi) {
          return NextResponse.json({ error: 'Akun sudah terverifikasi' }, { status: 400 });
        }
        // status 'rejected' = login ditolak (lihat /api/auth/login).
        await db.query("UPDATE users SET status = 'rejected' WHERE id = ?", [user_id]);

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_ditolak',
          judul: 'Verifikasi Akun Ditolak',
          pesan: `Verifikasi akun Anda ditolak.${reject_reason ? ' Alasan: ' + reject_reason : ''}`,
          link: '/profil',
        });

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'tolak_verifikasi_akun',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel})${reject_reason ? ': ' + reject_reason : ''}`,
        });

        return NextResponse.json({ message: 'Verifikasi akun ditolak.' });
      }

      case 'update_reg_status':
        if (!reg_status) return NextResponse.json({ error: 'reg_status wajib diisi' }, { status: 400 });
        await db.query('UPDATE users SET reg_status = ? WHERE id = ?', [reg_status, user_id]);

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'update_reg_status',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name}: reg_status -> ${reg_status}`,
        });

        return NextResponse.json({ message: 'Status pendaftaran diupdate.', reg_status });

      case 'set_status': {
        const statusBaru = new_status === 'active' ? 'active' : 'nonaktif';
        await db.query('UPDATE users SET status = ? WHERE id = ?', [statusBaru, user_id]);

        await catatAudit(db, {
          actor: auth.user,
          aksi: statusBaru === 'active' ? 'aktifkan_user' : 'nonaktifkan_user',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel})`,
        });

        return NextResponse.json({ message: statusBaru === 'active' ? 'User diaktifkan.' : 'User dinonaktifkan.', status: statusBaru });
      }

      // Edit data akun oleh admin — dari Database Perwakilan (klik nama).
      // no_perjanjian_kerjasama, kode_unik, status SENGAJA gak masuk whitelist:
      // nomor surat dibekukan sistem (biar gak bentrok sama counter), kode_unik
      // itu identitas permanen, status punya jalur toggle sendiri.
      case 'edit_data': {
        const ALLOWED = [
          'name', 'nik', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin', 'nama_ibu',
          'alamat_ktp', 'alamat_domisili', 'wa', 'email', 'pekerjaan',
          'bank', 'no_rekening', 'nama_pemilik_rekening', 'perekrut_id', 'wilayah',
        ];
        const input = fields || {};
        const keys = Object.keys(input).filter(k => ALLOWED.includes(k));
        if (keys.length === 0) {
          return NextResponse.json({ error: 'Tidak ada field yang diubah' }, { status: 400 });
        }

        if (keys.includes('perekrut_id') && input.perekrut_id) {
          if (String(input.perekrut_id) === String(user_id)) {
            return NextResponse.json({ error: 'Tidak bisa jadi perekrut diri sendiri' }, { status: 400 });
          }
          // Perekrut wajib role SAMA dengan target (perwakilan direkrut
          // perwakilan, sahabat direkrut sahabat) — dulu hardcode
          // 'perwakilan' aja, akun sahabat gak bisa diedit perekrutnya
          // lewat form ini.
          const [p] = await db.query(
            'SELECT id FROM users WHERE id = ? AND (role = ? OR role_kedua = ?)',
            [input.perekrut_id, target.role, target.role]
          );
          if (p.length === 0) {
            return NextResponse.json({ error: 'Perekrut tidak ditemukan' }, { status: 400 });
          }
        }

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const vals = keys.map(k => input[k] === '' ? null : input[k]);
        await db.query(`UPDATE users SET ${setClause} WHERE id = ?`, [...vals, user_id]);

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'edit_data_user',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name} (${roleLabel}): ${keys.join(', ')} diubah`,
        });

        return NextResponse.json({ message: 'Data berhasil diperbarui.' });
      }

      // Dual-role akun (Perwakilan + Sahabat Baitullah/sahabat) — KHUSUS buat
      // orang yang direkrut LANGSUNG oleh manajemen (bukan via link
      // referral), dikonfirmasi user 2026-09-06. Bikin baris pendaftaran
      // baru dgn data disalin dari users (orang yang sama, gak perlu isi
      // ulang KTP — itu justru sumber masalah "NIK gak boleh sama" yang
      // memicu fitur ini), perekrut_id SENGAJA NULL (gak ada komisi
      // upline), untuk_role_kedua=1 supaya langkah "advance ke active" di
      // status-pendaftaran nulis ke role_kedua, bukan menimpa role utama.
      // Tetap wajib lewat proses lengkap (BSI/SK-CIF/Surat Kuasa fisik utk
      // sahabat, dst) — gak ada fast-track, cuma jalur masuknya beda.
      case 'tambah_role_kedua': {
        const roleKedua = body.role_kedua;
        // Cuma 'sahabat_baitullah' (dipicu dari admin/sahabat) -- arah
        // 'perwakilan' dipusatkan di action 'rekrut_jadi_perwakilan'
        // (dikonfirmasi user 2026-10-12), gak lagi lewat sini.
        if (roleKedua !== 'sahabat_baitullah') {
          return NextResponse.json({ error: 'role_kedua harus sahabat_baitullah' }, { status: 400 });
        }
        if (target.status !== 'active') {
          return NextResponse.json({ error: 'Akun harus aktif dulu sebelum diberi role kedua' }, { status: 400 });
        }
        // Jamaah ATAU Perwakilan boleh direkrut jadi Sahabat Baitullah
        // (dikonfirmasi user 2026-10-21 -- mirror rekrut_jadi_perwakilan yang
        // udah lebih dulu bisa narik dari Jamaah/Sahabat Baitullah, picker
        // ini sebelumnya cuma Perwakilan doang, inkonsisten). Sumber Jamaah
        // TIDAK langsung dapet role_kedua (mirror isDariSahabat di
        // rekrut_jadi_perwakilan) -- role-nya baru resmi diputuskan pas
        // pendaftaran Sahabat Baitullah-nya diaktifkan, SAMA PERSIS jalur
        // jamaah yang daftar sendiri lewat funnel native.
        if (!['jamaah', 'perwakilan'].includes(target.role)) {
          return NextResponse.json({ error: 'Role kedua "sahabat_baitullah" cuma bisa ditambahkan ke akun Jamaah atau Perwakilan.' }, { status: 400 });
        }
        if (target.role_kedua) {
          return NextResponse.json({ error: 'Akun ini sudah punya role kedua' }, { status: 400 });
        }

        const isDariPerwakilan = target.role === 'perwakilan';

        const [[u]] = await db.query(
          `SELECT name, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu, alamat,
                  alamat_ktp, alamat_domisili, alamat_kirim, kode_pos, wa, email, pekerjaan,
                  bank, no_rekening, nama_pemilik_rekening, foto_ktp_path
           FROM users WHERE id = ?`, [user_id]
        );

        await db.query(
          `INSERT INTO sahabat_pendaftaran
            (user_id, nama, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu,
             alamat, alamat_ktp, alamat_domisili, kode_pos, wa, email, pekerjaan,
             bank, no_rekening, nama_pemilik_rekening, foto_ktp_path, perekrut_id,
             status, untuk_role_kedua)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
          [user_id, u.name, u.nik, u.tempat_lahir, u.tanggal_lahir, u.jenis_kelamin, u.nama_ibu,
           u.alamat_ktp || u.alamat, u.alamat_ktp, u.alamat_domisili, u.kode_pos, u.wa, u.email, u.pekerjaan,
           u.bank, u.no_rekening, u.nama_pemilik_rekening, u.foto_ktp_path, isDariPerwakilan ? 1 : 0]
        );

        if (isDariPerwakilan) {
          await db.query(
            'UPDATE users SET role_kedua = ?, role_kedua_ditambahkan_at = NOW() WHERE id = ?',
            [roleKedua, user_id]
          );
        }

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_aktif',
          judul: isDariPerwakilan ? 'Role Kedua Ditambahkan' : 'Direkrut Jadi Sahabat Baitullah',
          pesan: isDariPerwakilan
            ? 'Akun Anda sekarang juga terdaftar sebagai Jamaah Sahabat Baitullah. Lengkapi proses pendaftarannya di halaman Profil.'
            : 'Anda direkrut langsung oleh manajemen JM Travel sebagai Jamaah Sahabat Baitullah. Lengkapi proses pendaftarannya di halaman Profil.',
          link: '/profil',
        });

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'tambah_role_kedua',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name}: direkrut jadi Sahabat Baitullah dari akun ${isDariPerwakilan ? 'Perwakilan (dual-role)' : 'Jamaah'}`,
        });

        return NextResponse.json({ message: 'Role kedua berhasil ditambahkan.', role_kedua: roleKedua });
      }

      // Rekrut langsung jadi Perwakilan dari akun existing (Jamaah atau
      // Sahabat Baitullah) — dipicu dari /admin/perwakilan (dikonfirmasi
      // user 2026-10-12, gantiin tombol "Tambahkan Role Perwakilan" yang
      // sebelumnya numpang di Database Jamaah Sahabat, dipusatkan ke
      // halaman Perwakilan biar "rumah"-nya jelas 1 tempat).
      //
      // BEDA dari tambah_role_kedua di atas:
      // - Sumber Sahabat Baitullah -> SAMA PERSIS tambah_role_kedua
      //   (role_kedua='perwakilan', identitas sahabat tetap dipertahankan
      //   sebagai role utama, dual-membership).
      // - Sumber Jamaah biasa -> BUKAN dual-role (jamaah bukan status
      //   kemitraan yang perlu dipertahankan) -- untuk_role_kedua=0, jadi
      //   begitu diaktifkan nanti, jalur NORMAL di /api/status-pendaftaran
      //   (bukan cabang untuk_role_kedua) yang jalan: `role` user ini
      //   LANGSUNG ditimpa jadi 'perwakilan'. Booking/riwayat lama tetap
      //   aman (tetap nempel di user_id yang sama, dashboard/jamaah sudah
      //   lama support nampilin "Booking Saya" buat role non-jamaah).
      case 'rekrut_jadi_perwakilan': {
        if (target.status !== 'active') {
          return NextResponse.json({ error: 'Akun harus aktif dulu sebelum direkrut jadi Perwakilan' }, { status: 400 });
        }
        if (!['jamaah', 'sahabat_baitullah'].includes(target.role)) {
          return NextResponse.json({ error: 'Cuma akun Jamaah atau Sahabat Baitullah yang bisa direkrut jadi Perwakilan lewat sini' }, { status: 400 });
        }
        if (target.role_kedua === 'perwakilan') {
          return NextResponse.json({ error: 'Akun ini sudah punya role Perwakilan' }, { status: 400 });
        }
        // Sahabat Baitullah yang masuk team HoP (downline-nya) GAK BOLEH
        // direkrut jadi Perwakilan (dikonfirmasi user 2026-10-12). Dicek di
        // SINI juga (bukan cuma disaring di picker GET) -- defense-in-depth,
        // jangan percaya cuma dari hasil pencarian yang udah disaring,
        // endpoint ini harus tetap nolak sendiri kalau somehow dipanggil
        // langsung. Jamaah biasa gak kena cek ini sama sekali.
        if (target.role === 'sahabat_baitullah' && await apakahBagianTeamHop(db, user_id)) {
          return NextResponse.json({ error: 'Anggota team Head of Program tidak boleh direkrut jadi Perwakilan.' }, { status: 400 });
        }
        const [[existing]] = await db.query(
          "SELECT id FROM agen_pendaftaran WHERE user_id = ? AND role_diajukan = 'perwakilan' AND status NOT IN ('ditolak') LIMIT 1",
          [user_id]
        );
        if (existing) {
          return NextResponse.json({ error: 'Akun ini sudah punya pendaftaran Perwakilan yang sedang berjalan' }, { status: 400 });
        }

        const isDariSahabat = target.role === 'sahabat_baitullah';
        const [[u]] = await db.query(
          `SELECT name, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, nama_ibu, alamat,
                  alamat_ktp, alamat_domisili, alamat_kirim, kode_pos, wa, email, pekerjaan,
                  bank, no_rekening, nama_pemilik_rekening, foto_ktp_path
           FROM users WHERE id = ?`, [user_id]
        );

        // metode = NULL (SENGAJA, dikonfirmasi user 2026-10-12) -- sama
        // persis pendaftaran mandiri (/api/daftar-perwakilan): orang yang
        // direkrut TETAP wajib TTD digital formulir + setuju PKS, lalu
        // milih sendiri kantor/paket lewat /daftar-perwakilan/metode. Admin
        // gak lagi nebak/pre-pilih metode-nya di sini (dulu ada dropdown
        // "Metode: Kantor/Paket" di picker, dihapus).
        await db.query(
          `INSERT INTO agen_pendaftaran
            (user_id, role_diajukan, nama, nik, tanggal_lahir, jenis_kelamin, nama_ibu,
             alamat, kode_pos, wa, email, pekerjaan, bank, no_rekening, nama_pemilik_rekening,
             perekrut_id, metode, status, alamat_ktp, alamat_domisili, alamat_kirim,
             foto_ktp_path, tempat_lahir, untuk_role_kedua)
           VALUES (?, 'perwakilan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', ?, ?, ?, ?, ?, ?)`,
          [user_id, u.name, u.nik, u.tanggal_lahir, u.jenis_kelamin, u.nama_ibu,
           u.alamat_ktp || u.alamat, u.kode_pos, u.wa, u.email, u.pekerjaan, u.bank, u.no_rekening, u.nama_pemilik_rekening,
           u.alamat_ktp, u.alamat_domisili, u.alamat_kirim, u.foto_ktp_path, u.tempat_lahir, isDariSahabat ? 1 : 0]
        );

        if (isDariSahabat) {
          await db.query(
            'UPDATE users SET role_kedua = ?, role_kedua_ditambahkan_at = NOW() WHERE id = ?',
            ['perwakilan', user_id]
          );
        }

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_aktif',
          judul: isDariSahabat ? 'Role Kedua Ditambahkan' : 'Direkrut Jadi Perwakilan',
          pesan: isDariSahabat
            ? 'Akun Anda sekarang juga terdaftar sebagai Perwakilan. Lengkapi proses pendaftarannya di halaman Profil.'
            : 'Anda direkrut langsung oleh manajemen JM Travel sebagai Perwakilan. Lengkapi proses pendaftarannya di halaman Profil.',
          link: '/profil',
        });

        await catatAudit(db, {
          actor: auth.user,
          aksi: 'rekrut_jadi_perwakilan',
          target_type: 'user',
          target_id: target.id,
          keterangan: `${target.name}: direkrut jadi Perwakilan dari akun ${isDariSahabat ? 'Sahabat Baitullah (dual-role)' : 'Jamaah'}`,
        });

        return NextResponse.json({ message: 'Berhasil direkrut jadi Perwakilan.' });
      }

      default:
        return NextResponse.json({ error: 'Action tidak dikenal' }, { status: 400 });
    }
  } catch (err) {
    console.error('Error patch user:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
