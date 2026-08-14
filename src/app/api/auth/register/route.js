import pool from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body.name||'').trim();
    const email = String(body.email||'').trim();
    const wa = String(body.wa||'').trim();
    const nik = String(body.nik||'').trim();
    const password = String(body.password||'').trim();
    const role = body.role || 'jamaah';
    const perekrutId = body.perekrut_id ? String(body.perekrut_id).trim() : null;

    // Validasi field wajib
    if (!name || !email || !wa || !nik || !password || !role) {
      return Response.json({ error: 'Semua field wajib diisi' }, { status: 400 });
    }

    // Role "agen" sudah dihapus dari sistem — tolak eksplisit dengan pesan
    // yang jelas (kalau tidak, INSERT di bawah bakal gagal mentah karena
    // enum users.role di DB sudah tidak punya 'agen' lagi).
    if (role === 'agen') {
      return Response.json({ error: 'Role "agen" sudah tidak tersedia. Gunakan role "perwakilan".' }, { status: 400 });
    }

    // Perekrut (kalau dipilih) menentukan rantai komisi override.
    // Aturan: perwakilan hanya bisa direkrut perwakilan lain.
    if (perekrutId && role === 'perwakilan') {
      const [p] = await pool.query(
        `SELECT id FROM users WHERE id = ? AND role = 'perwakilan' AND status = 'active'`,
        [perekrutId]
      );
      if (p.length === 0) {
        return Response.json({ error: 'Perekrut tidak ditemukan atau sedang tidak aktif' }, { status: 400 });
      }
    }

    // Cek duplikat
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email=? OR wa=? OR nik=?',
      [email, wa, nik]
    );
    if (existing.length > 0) {
      return Response.json({ error: 'Email, WA, atau NIK sudah terdaftar' }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate kode unik
    const prefix = role === 'perwakilan' ? 'PJM' : 'JUJM';
    const [countRows] = await pool.query('SELECT COUNT(*) as total FROM users WHERE role=?', [role]);
    const kodeUnik = prefix + String(countRows[0].total + 1).padStart(4, '0');

    // Insert user
    // Jamaah langsung AKTIF, tidak perlu ACC admin.
    // Perwakilan tetap pending sampai diverifikasi admin.
    const status = (role === 'perwakilan') ? 'pending' : 'active';
    await pool.query(
      // terverifikasi = 0: akun baru WAJIB verifikasi WA/Email dulu
      'INSERT INTO users (name, email, wa, nik, password, role, kode_unik, status, terverifikasi, perekrut_id) VALUES (?,?,?,?,?,?,?,?,0,?)',
      [name, email, wa, nik, hashedPassword, role, kodeUnik, status, perekrutId]
    );

    return Response.json({ message: 'Registrasi berhasil!', kodeUnik }, { status: 201 });

  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}