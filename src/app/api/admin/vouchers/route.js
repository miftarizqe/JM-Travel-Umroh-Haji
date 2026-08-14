 import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';

// GET /api/admin/vouchers — daftar semua voucher
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query(
      `SELECT v.*, p.name AS prog_name
       FROM vouchers v LEFT JOIN programs p ON p.id = v.prog_id
       ORDER BY v.created_at DESC`
    );
    return Response.json({ vouchers: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST /api/admin/vouchers — admin membuat voucher
// body: { kode, potongan, kuota?, valid_until?, prog_id?, catatan?, dibuat_oleh,
//         akses_role ('publik'|'perwakilan'|'akun'), for_user? (wajib kalau akun), tampil }
// `kuota` & `valid_until` NULL = tanpa batas (independen, boleh dua-duanya aktif
// atau dua-duanya kosong) — bukan pilih salah satu.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const {
      kode, potongan, kuota, valid_until, prog_id, catatan, dibuat_oleh,
      akses_role, for_user, tampil,
    } = await request.json();

    if (!kode || !String(kode).trim()) {
      return Response.json({ error: 'Kode voucher wajib diisi' }, { status: 400 });
    }
    if (!potongan || Number(potongan) <= 0) {
      return Response.json({ error: 'Nominal potongan wajib diisi' }, { status: 400 });
    }
    const aksesFinal = ['publik', 'perwakilan', 'akun'].includes(akses_role) ? akses_role : 'publik';
    if (aksesFinal === 'akun' && !for_user) {
      return Response.json({ error: 'Pilih akun tujuan buat voucher khusus akun' }, { status: 400 });
    }

    const kodeUpper = String(kode).trim().toUpperCase();

    // Cek duplikat
    const [dupe] = await pool.query('SELECT id FROM vouchers WHERE kode = ?', [kodeUpper]);
    if (dupe.length > 0) {
      return Response.json({ error: 'Kode voucher sudah dipakai' }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO vouchers (kode, potongan, kuota, terpakai, aktif, prog_id, for_user, akses_role, tampil, valid_until, catatan, dibuat_oleh, used)
       VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [kodeUpper, Number(potongan), kuota != null ? Number(kuota) : null, prog_id || null,
       aksesFinal === 'akun' ? for_user : null, aksesFinal, tampil === false ? 0 : 1,
       valid_until || null, catatan || null, dibuat_oleh || null]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'buat_voucher',
      target_type: 'voucher',
      target_id: kodeUpper,
      keterangan: `Potongan Rp ${Number(potongan).toLocaleString('id-ID')}, kuota ${kuota != null ? kuota + ' jamaah' : 'tanpa batas'}, akses ${aksesFinal}`,
    });

    return Response.json({ message: 'Voucher berhasil dibuat!', kode: kodeUpper }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/vouchers — aktif / nonaktif
// body: { id, aktif }
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id, aktif } = await request.json();
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    const [v] = await pool.query('SELECT kode FROM vouchers WHERE id = ?', [id]);
    await pool.query('UPDATE vouchers SET aktif = ? WHERE id = ?', [aktif ? 1 : 0, id]);

    await catatAudit(pool, {
      actor: auth.user,
      aksi: aktif ? 'aktifkan_voucher' : 'nonaktifkan_voucher',
      target_type: 'voucher',
      target_id: v[0]?.kode || id,
    });

    return Response.json({ message: aktif ? 'Voucher diaktifkan.' : 'Voucher dinonaktifkan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/vouchers?id=xxx
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id wajib diisi' }, { status: 400 });

    // Cegah hapus kalau sudah pernah dipakai
    const [v] = await pool.query('SELECT kode, terpakai FROM vouchers WHERE id = ?', [id]);
    if (v.length && Number(v[0].terpakai) > 0) {
      return Response.json({ error: 'Voucher sudah pernah dipakai, tidak bisa dihapus. Nonaktifkan saja.' }, { status: 400 });
    }

    await pool.query('DELETE FROM vouchers WHERE id = ?', [id]);

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'hapus_voucher',
      target_type: 'voucher',
      target_id: v[0]?.kode || id,
    });

    return Response.json({ message: 'Voucher dihapus.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
