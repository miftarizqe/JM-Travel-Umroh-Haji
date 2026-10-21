import { randomUUID } from 'crypto';
import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { wajibRole } from '@/lib/auth';
import { emailValid, nikValid, normalisasiWA, varianWA } from '@/lib/validasiAkun';
import { pastikanKodeUnik } from '@/lib/kodeUnik';
import { catatAudit } from '@/lib/audit';

// GET /api/admin/agen — list akun role='agen' ("Database Account"). Murni
// data akun — jumlah booking/komisi pindah ke halaman Riwayat Closing &
// Pencairan Komisi masing-masing (dikonfirmasi user 2026-10-17, komisi
// sekarang beneran tercatat di komisi_ledger lewat closing.js, bukan
// dihitung on-the-fly lagi di sini).
export async function GET(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT id, name, nik, email, wa, jenis_kelamin, kode_unik, status, created_at
       FROM users WHERE role = 'agen' ORDER BY created_at DESC`
    );
    // Opsi dropdown "Perekrut" pas bikin akun agen baru (dikonfirmasi user
    // 2026-10-21) -- agen lain + staff admin, MURNI catatan "siapa yang
    // bawa orang ini masuk", gak ngaruh ke komisi apa pun (beda dari
    // perekrut_id perwakilan yang nentuin ujroh override). Ditaruh di sini
    // (bukan GET /api/admin/users) karena admin biasa gak boleh lihat akun
    // staff admin/super_admin lain lewat endpoint itu -- query khusus ini
    // cuma balikin id+nama, gak ada data sensitif lain.
    const [perekrutOptions] = await pool.query(
      `SELECT id, name, role FROM users WHERE role IN ('agen','admin','super_admin') ORDER BY role, name ASC`
    );
    return Response.json({ agen: rows, perekrut_options: perekrutOptions });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/agen — admin bikin akun agen langsung, AKTIF seketika,
// gak ada funnel pending/approve (dikonfirmasi user 2026-10-17 — beda dari
// perwakilan/sahabat yang punya proses pendaftaran lengkap, agen cuma butuh
// login buat ambil link referral pribadi mereka).
export async function POST(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const name = String(body.nama || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const nikInput = String(body.nik || '').trim();
    const waInput = String(body.wa || '').trim();
    const jenisKelamin = String(body.jenis_kelamin || '').trim();
    const password = String(body.password || '').trim();
    // Data tambahan (dikonfirmasi user 2026-10-21, "datanya sayang kalo gak
    // dipake") -- semuanya opsional kecuali disebutkan lain, kolom generik
    // yang udah ada di users (dipakai perwakilan/sahabat juga), gak perlu
    // kolom baru.
    const tempatLahir = String(body.tempat_lahir || '').trim() || null;
    const bank = String(body.bank || '').trim() || null;
    const noRekening = String(body.no_rekening || '').trim() || null;
    const namaPemilikRekening = String(body.nama_pemilik_rekening || '').trim() || null;
    const fotoKtpPath = String(body.foto_ktp_path || '').trim() || null;
    const perekrutId = String(body.perekrut_id || '').trim() || null;

    // NIK tetap WAJIB (koreksi 2026-10-21 -- yang dimaksud opsional itu
    // FOTO KTP-nya, bukan NIK). WA OPSIONAL buat agen (migration 243 --
    // kolomnya generik dipakai semua role, jadi NOT NULL dilonggarin cuma
    // buat wa, nik dikembalikan NOT NULL lagi lewat migration 244).
    if (!name) return Response.json({ error: 'Nama wajib diisi', field: 'nama' }, { status: 400 });
    if (!email) return Response.json({ error: 'Email wajib diisi', field: 'email' }, { status: 400 });
    if (!nikInput) return Response.json({ error: 'NIK wajib diisi', field: 'nik' }, { status: 400 });
    if (!jenisKelamin) return Response.json({ error: 'Jenis kelamin wajib diisi', field: 'jk' }, { status: 400 });
    if (!password) return Response.json({ error: 'Password wajib diisi', field: 'password' }, { status: 400 });
    if (!['Laki-Laki', 'Perempuan'].includes(jenisKelamin)) {
      return Response.json({ error: 'Jenis kelamin tidak valid', field: 'jk' }, { status: 400 });
    }
    if (!nikValid(nikInput)) {
      return Response.json({ error: 'NIK harus 16 digit angka', field: 'nik' }, { status: 400 });
    }
    if (!emailValid(email)) {
      return Response.json({ error: 'Format email tidak valid', field: 'email' }, { status: 400 });
    }
    const wa = waInput ? normalisasiWA(waInput) : null;
    if (waInput && !wa) {
      return Response.json({ error: 'Nomor WhatsApp tidak valid (contoh: 081234567890)', field: 'wa' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password minimal 8 karakter', field: 'password' }, { status: 400 });
    }

    // Dicek PER FIELD (bukan 1 query gabungan OR) biar frontend bisa
    // nandain persis field mana yang bentrok, bukan cuma pesan generik
    // "salah satu dari tiga ini" (dikonfirmasi user 2026-10-21 — field
    // yang gak sesuai wajib dimerahin).
    const [[dupEmail]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (dupEmail) return Response.json({ error: 'Email sudah terdaftar', field: 'email' }, { status: 400 });
    if (wa) {
      const [[dupWa]] = await pool.query('SELECT id FROM users WHERE wa IN (?)', [varianWA(wa)]);
      if (dupWa) return Response.json({ error: 'No. WhatsApp sudah terdaftar', field: 'wa' }, { status: 400 });
    }
    const [[dupNik]] = await pool.query('SELECT id FROM users WHERE nik = ?', [nikInput]);
    if (dupNik) return Response.json({ error: 'NIK sudah terdaftar', field: 'nik' }, { status: 400 });

    if (perekrutId) {
      const [[perekrutAda]] = await pool.query(
        "SELECT id FROM users WHERE id = ? AND role IN ('agen','admin','super_admin')", [perekrutId]
      );
      if (!perekrutAda) {
        return Response.json({ error: 'Perekrut tidak ditemukan', field: 'perekrut_id' }, { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    // id digenerate EKSPLISIT sebelum INSERT (bukan andalin result.insertId)
    // -- bug nyata ditemukan 2026-10-19: users.id itu varchar(36) DEFAULT
    // (uuid()), BUKAN auto-increment, jadi result.insertId SELALU balik 0.
    // pastikanKodeUnik(pool, 0, 'agen') nembak baris id=0 yang gak ada,
    // UPDATE-nya diam-diam gak ngenain siapa-siapa -- akun agen yang
    // dibuat lewat form ini SELALU kode_unik-nya NULL selamanya (ketemu
    // dari akun demo yang nyangkut di "Memuat..." terus, lihat
    // /api/agen/kode-unik self-heal endpoint yang nambal gejalanya duluan).
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users
        (id, name, email, wa, nik, jenis_kelamin, password, role, status, terverifikasi, created_at,
         tempat_lahir, bank, no_rekening, nama_pemilik_rekening, foto_ktp_path, perekrut_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'agen', 'active', 1, NOW(), ?, ?, ?, ?, ?, ?)`,
      [userId, name, email, wa, nikInput || null, jenisKelamin, hashedPassword,
       tempatLahir, bank, noRekening, namaPemilikRekening, fotoKtpPath, perekrutId]
    );
    const kodeUnik = await pastikanKodeUnik(pool, userId, 'agen');

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'buat_akun_agen',
      target_type: 'user',
      target_id: userId,
      keterangan: `Akun agen baru dibuat: ${name} (${kodeUnik})`,
    });

    return Response.json({ message: 'Akun agen dibuat.', id: userId, kode_unik: kodeUnik }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/agen  body: { id, aktif? } ATAU { id, edit: { nama, wa, jenis_kelamin } }
// `aktif` (toggle status, perilaku lama) dan `edit` (ubah data, dikonfirmasi
// user 2026-10-19) sengaja dipisah field biar gak ketuker jadi 1 request
// yang niatnya beda — toggle aktif gak perlu validasi WA/jenis kelamin,
// edit gak perlu tau status aktif.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  try {
    const { id, aktif, edit } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    const [[target]] = await pool.query("SELECT name FROM users WHERE id = ? AND role = 'agen'", [id]);
    if (!target) return Response.json({ error: 'Akun agen tidak ditemukan' }, { status: 404 });

    if (edit) {
      const nama = String(edit.nama || '').trim();
      const waInput = String(edit.wa || '').trim();
      const jenisKelamin = String(edit.jenis_kelamin || '').trim();
      if (!nama || !waInput || !jenisKelamin) {
        return Response.json({ error: 'Nama, WA, dan jenis kelamin wajib diisi' }, { status: 400 });
      }
      if (!['Laki-Laki', 'Perempuan'].includes(jenisKelamin)) {
        return Response.json({ error: 'Jenis kelamin tidak valid' }, { status: 400 });
      }
      const wa = normalisasiWA(waInput);
      if (!wa) {
        return Response.json({ error: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' }, { status: 400 });
      }
      const [dup] = await pool.query('SELECT id FROM users WHERE wa IN (?) AND id != ?', [varianWA(wa), id]);
      if (dup.length > 0) {
        return Response.json({ error: 'Nomor WhatsApp sudah dipakai akun lain' }, { status: 400 });
      }

      await pool.query('UPDATE users SET name = ?, wa = ?, jenis_kelamin = ? WHERE id = ?', [nama, wa, jenisKelamin, id]);
      await catatAudit(pool, {
        actor: auth.user,
        aksi: 'edit_akun_agen',
        target_type: 'user',
        target_id: id,
        keterangan: `Akun agen ${target.name} diubah jadi: ${nama}, ${wa}, ${jenisKelamin}`,
      });
      return Response.json({ message: 'Data akun diperbarui.' });
    }

    await pool.query("UPDATE users SET status = ? WHERE id = ?", [aktif ? 'active' : 'nonaktif', id]);
    await catatAudit(pool, {
      actor: auth.user,
      aksi: aktif ? 'aktifkan_akun_agen' : 'nonaktifkan_akun_agen',
      target_type: 'user',
      target_id: id,
      keterangan: `Akun agen ${target.name} di${aktif ? 'aktifkan' : 'nonaktifkan'}`,
    });
    return Response.json({ message: 'Status akun diperbarui.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/agen?id=xxx — hapus PERMANEN, cuma kalau akun ini BELUM
// pernah punya riwayat booking/komisi (dikonfirmasi user 2026-10-19).
// Alasan: referral_agen_id di bookings & komisi_ledger gak punya FK
// constraint (lihat migration 235/236) — kalau akun dihapus padahal udah
// ada histori, baris lama jadi nunjuk ke user_id yatim, atribusi "siapa
// yang closing-in" di closing.js/Riwayat Closing bakal gagal resolve nama
// (getUser balik null). Akun yang UDAH punya histori cuma boleh
// dinonaktifkan (tombol existing), bukan dihapus.
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin', 'super_admin']);
  if (auth.error) return auth.error;
  let conn;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'Format id agen tidak valid' }, { status: 400 });
    }

    conn = await pool.getConnection();
    const [[target]] = await conn.query("SELECT name FROM users WHERE id = ? AND role = 'agen'", [id]);
    if (!target) return Response.json({ error: 'Akun agen tidak ditemukan' }, { status: 404 });

    const [[{ jumlahBooking }]] = await conn.query(
      'SELECT COUNT(*) AS jumlahBooking FROM bookings WHERE referral_agen_id = ?',
      [id]
    );
    // Semua baris ledger menjadi riwayat komisi/pencairan. Pengajuan ujroh
    // agen menautkan pencairannya ke baris ledger lewat
    // komisi_ledger.pengajuan_ujroh_agen_id (migration 236), bukan langsung
    // ke user, jadi memeriksa seluruh ledger penerima_id juga melindungi
    // relasi pencairannya.
    const [[{ jumlahKomisi }]] = await conn.query(
      'SELECT COUNT(*) AS jumlahKomisi FROM komisi_ledger WHERE penerima_id = ?',
      [id]
    );
    // users.perekrut_id menyimpan rantai perekrutan (migration 010). Jangan
    // putuskan rantai tersebut dengan menghapus akun perekrut.
    const [[{ jumlahDownline }]] = await conn.query(
      'SELECT COUNT(*) AS jumlahDownline FROM users WHERE perekrut_id = ?',
      [id]
    );
    if (jumlahBooking > 0 || jumlahKomisi > 0 || jumlahDownline > 0) {
      return Response.json({ error: 'Akun ini masih memiliki data booking, komisi, pencairan, atau downline terkait sehingga tidak bisa dihapus. Nonaktifkan saja.' }, { status: 409 });
    }

    // Jangan biarkan foreign key lain menghasilkan 500 saat menghapus user.
    // Catatan dari dev DB: invoice_kwitansi.dibuat_oleh,
    // booking_penyesuaian_harga.diajukan_oleh, program_waitlist.user_id,
    // kalkulator_lead.user_id, kalkulator_perwakilan_lead.perwakilan_id,
    // materi_sahabat.diupload_oleh semuanya mereferensikan users.id.
    const [[riwayat]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM invoice_kwitansi WHERE dibuat_oleh = ?) AS invoice,
         (SELECT COUNT(*) FROM booking_penyesuaian_harga WHERE diajukan_oleh = ?) AS penyesuaianBooking,
         (SELECT COUNT(*) FROM program_waitlist WHERE user_id = ?) AS waitlist,
         (SELECT COUNT(*) FROM kalkulator_lead WHERE user_id = ?) AS leadKalkulator,
         (SELECT COUNT(*) FROM kalkulator_perwakilan_lead WHERE perwakilan_id = ?) AS leadPerwakilan,
         (SELECT COUNT(*) FROM materi_sahabat WHERE diupload_oleh = ?) AS materiSahabat`,
      [id, id, id, id, id, id]
    );
    const relasiTersimpan = [
      ['invoice', 'invoice'],
      ['penyesuaianBooking', 'penyesuaian booking'],
      ['waitlist', 'waitlist program'],
      ['leadKalkulator', 'lead kalkulator'],
      ['leadPerwakilan', 'lead perwakilan'],
      ['materiSahabat', 'materi Sahabat'],
    ].filter(([kolom]) => Number(riwayat[kolom]) > 0).map(([, label]) => label);
    if (relasiTersimpan.length > 0) {
      return Response.json({ error: `Akun ini masih memiliki data terkait (${relasiTersimpan.join(', ')}), jadi tidak bisa dihapus. Nonaktifkan saja.` }, { status: 409 });
    }

    // Trigger users_cegah_hapus_langsung hanya mengizinkan penghapusan
    // melalui jalur aplikasi yang memasang flag pada koneksi MySQL yang sama.
    // Sesi khusus diperlukan: pool.query terpisah bisa memilih koneksi lain.
    await conn.beginTransaction();
    await conn.query('SET @izin_hapus_users = 1');
    await conn.query('DELETE FROM users WHERE id = ?', [id]);
    await catatAudit(conn, {
      actor: auth.user,
      aksi: 'hapus_akun_agen',
      target_type: 'user',
      target_id: id,
      keterangan: `Akun agen ${target.name} dihapus permanen (belum ada riwayat booking/komisi)`,
    });
    await conn.commit();
    return Response.json({ message: 'Akun agen dihapus.' });
  } catch (error) {
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    if (conn) {
      // Jangan kembalikan koneksi ke pool dengan izin penghapusan tertinggal.
      try {
        await conn.query('SET @izin_hapus_users = 0');
        conn.release();
      } catch (error) {
        console.error('Gagal mereset izin hapus users; koneksi dibuang dari pool.', error);
        conn.destroy();
      }
    }
  }
}
