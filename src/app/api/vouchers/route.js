import pool from '@/lib/db';
import { wajibLogin, wajibRole } from '@/lib/auth';

// GET — cek voucher by kode
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const kode = searchParams.get('kode');
    const userId = searchParams.get('user_id');

    if (!kode) {
      return Response.json({ error: 'Kode voucher wajib diisi' }, { status: 400 });
    }

    const [vouchers] = await pool.query(
      'SELECT * FROM vouchers WHERE kode = ?',
      [kode.toUpperCase()]
    );

    if (vouchers.length === 0) {
      return Response.json({ error: 'Voucher tidak ditemukan' }, { status: 404 });
    }

    const v = vouchers[0];

    if (v.used) {
      return Response.json({ error: 'Voucher sudah digunakan' }, { status: 400 });
    }

    if (new Date(v.valid_until) < new Date()) {
      return Response.json({ error: 'Voucher sudah kadaluarsa' }, { status: 400 });
    }

    if (v.for_user && v.for_user !== userId) {
      return Response.json({ error: 'Voucher tidak berlaku untuk akun ini' }, { status: 400 });
    }

    return Response.json({
      valid: true,
      voucher: {
        kode: v.kode,
        potongan: v.potongan,
        valid_until: v.valid_until,
        catatan: v.catatan
      }
    });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — buat voucher baru (admin only)
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { kode, potongan, for_user, valid_until, catatan } = await request.json();

    if (!kode || !potongan) {
      return Response.json({ error: 'Kode dan potongan wajib diisi' }, { status: 400 });
    }

    // Cek duplikat
    const [existing] = await pool.query(
      'SELECT id FROM vouchers WHERE kode = ?',
      [kode.toUpperCase()]
    );
    if (existing.length > 0) {
      return Response.json({ error: 'Kode voucher sudah ada' }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO vouchers (kode, potongan, for_user, valid_until, catatan)
       VALUES (?, ?, ?, ?, ?)`,
      [kode.toUpperCase(), potongan, for_user || null,
       valid_until || '2027-12-31', catatan || null]
    );

    return Response.json({ message: 'Voucher berhasil dibuat!' }, { status: 201 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH — nonaktifkan voucher
export async function PATCH(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;
  try {
    const { kode } = await request.json();

    if (!kode) {
      return Response.json({ error: 'Kode voucher wajib diisi' }, { status: 400 });
    }

    await pool.query(
      'UPDATE vouchers SET used = 1 WHERE kode = ?',
      [kode.toUpperCase()]
    );

    return Response.json({ message: 'Voucher berhasil dinonaktifkan!' });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}