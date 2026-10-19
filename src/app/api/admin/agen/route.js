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
    return Response.json({ agen: rows });
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
    const nik = String(body.nik || '').trim();
    const waInput = String(body.wa || '').trim();
    const jenisKelamin = String(body.jenis_kelamin || '').trim();
    const password = String(body.password || '').trim();

    if (!name || !email || !nik || !waInput || !jenisKelamin || !password) {
      return Response.json({ error: 'Semua field wajib diisi' }, { status: 400 });
    }
    if (!['Laki-Laki', 'Perempuan'].includes(jenisKelamin)) {
      return Response.json({ error: 'Jenis kelamin tidak valid' }, { status: 400 });
    }
    if (!nikValid(nik)) {
      return Response.json({ error: 'NIK harus 16 digit angka' }, { status: 400 });
    }
    if (!emailValid(email)) {
      return Response.json({ error: 'Format email tidak valid' }, { status: 400 });
    }
    const wa = normalisasiWA(waInput);
    if (!wa) {
      return Response.json({ error: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password minimal 8 karakter' }, { status: 400 });
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR wa IN (?) OR nik = ?',
      [email, varianWA(wa), nik]
    );
    if (existing.length > 0) {
      return Response.json({ error: 'Email, WA, atau NIK sudah terdaftar' }, { status: 400 });
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
      `INSERT INTO users (id, name, email, wa, nik, jenis_kelamin, password, role, status, terverifikasi, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'agen', 'active', 1, NOW())`,
      [userId, name, email, wa, nik, jenisKelamin, hashedPassword]
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
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const [[target]] = await pool.query("SELECT name FROM users WHERE id = ? AND role = 'agen'", [id]);
    if (!target) return Response.json({ error: 'Akun agen tidak ditemukan' }, { status: 404 });

    const [[{ jml }]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM bookings WHERE referral_agen_id = ?) +
         (SELECT COUNT(*) FROM komisi_ledger WHERE penerima_id = ? AND jenis = 'ujroh_agen') AS jml`,
      [id, id]
    );
    if (jml > 0) {
      return Response.json({ error: 'Akun ini sudah punya riwayat booking/komisi, tidak bisa dihapus permanen. Nonaktifkan saja.' }, { status: 400 });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'hapus_akun_agen',
      target_type: 'user',
      target_id: id,
      keterangan: `Akun agen ${target.name} dihapus permanen (belum ada riwayat booking/komisi)`,
    });
    return Response.json({ message: 'Akun agen dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
