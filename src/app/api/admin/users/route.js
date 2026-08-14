import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kirimNotifikasi } from '@/lib/notifikasi';
import { catatAudit } from '@/lib/audit';

// GET — list users, filter opsional by role & status
export async function GET(req) {
  const auth = wajibRole(req, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    let query = `
      SELECT u.id, u.name, u.email, u.wa, u.nik, u.role, u.kode_unik, u.status,
             u.wilayah, u.points, u.tabungan_bsi, u.perekrut_id, p.name AS perekrut_nama,
             u.reg_status, u.reg_metode, u.reg_jadwal, u.created_at,
             ap.id AS pendaftaran_id, ap.status AS pendaftaran_status,
             ap.sk_bsi_path, ap.metode AS pendaftaran_metode
      FROM users u
      LEFT JOIN users p ON p.id = u.perekrut_id
      LEFT JOIN agen_pendaftaran ap ON ap.id = (
        SELECT id FROM agen_pendaftaran WHERE user_id = u.id ORDER BY id DESC LIMIT 1
      )
      WHERE 1=1
    `;
    const params = [];
    if (role) { query += ' AND u.role = ?'; params.push(role); }
    if (status) { query += ' AND u.status = ?'; params.push(status); }
    query += ' ORDER BY u.created_at DESC';

    const [users] = await db.query(query, params);
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

    const [rows] = await db.query('SELECT id, name, role, perekrut_id FROM users WHERE id = ?', [user_id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }
    const target = rows[0];
    const roleLabel = { perwakilan: 'Perwakilan', jamaah: 'Jamaah' }[target.role] || target.role;

    switch (action) {
      case 'approve':
        await db.query("UPDATE users SET status = 'active', reg_status = 'active' WHERE id = ?", [user_id]);

        await kirimNotifikasi(db, {
          user_id: target.id,
          tipe: 'akun_aktif',
          judul: 'Akun Anda Aktif!',
          pesan: `Selamat, akun ${roleLabel} Anda sudah dikonfirmasi admin. Anda sekarang bisa order jamaah.`,
          link: target.role === 'perwakilan' ? '/dashboard/perwakilan' : '/dashboard/jamaah',
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
          const [p] = await db.query(
            "SELECT id FROM users WHERE id = ? AND role = 'perwakilan'",
            [input.perekrut_id]
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

      default:
        return NextResponse.json({ error: 'Action tidak dikenal' }, { status: 400 });
    }
  } catch (err) {
    console.error('Error patch user:', err);
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
