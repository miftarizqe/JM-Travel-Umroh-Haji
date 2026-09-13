import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { generateIdCardPdf } from '@/lib/id-card/generate';
import { absolutePathDariUrl } from '@/lib/dokumenProteksi';

// GET /api/admin/id-card/[userId] — admin download PDF ID card perwakilan.
export async function GET(request, { params }) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { userId } = await params;
    const [rows] = await pool.query(
      `SELECT name, role, kode_unik, foto_path FROM users WHERE id = ? AND role = 'perwakilan'`,
      [userId]
    );
    if (rows.length === 0) {
      return Response.json({ error: 'Perwakilan tidak ditemukan' }, { status: 404 });
    }
    const u = rows[0];
    if (!u.kode_unik) {
      return Response.json({ error: 'Kode unik belum diatur untuk akun ini' }, { status: 400 });
    }
    if (!u.foto_path) {
      return Response.json({ error: 'Belum ada foto profil. Minta yang bersangkutan upload foto dulu.' }, { status: 400 });
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const fotoAbsolutePath = absolutePathDariUrl(u.foto_path);

    // STOPGAP: kartu ID ini butuh sebuah URL publik buat QR code-nya
    // (generateIdCardPdf selalu menggambar QR, lihat src/lib/id-card/generate.js
    // — bukan bagian yang boleh diubah di sini). Halaman publik lama
    // /agen/[kode] (+ API agen-publik yang menyuplainya) sudah dihapus
    // bersama role agen, dan belum ada halaman verifikasi publik pengganti
    // untuk perwakilan. Sementara ini QR mengarah ke homepage dengan kode_unik
    // sebagai query param, supaya kartu tetap bisa dicetak tanpa link mati —
    // TOLONG DICEK ULANG oleh manusia begitu ada halaman verifikasi publik
    // perwakilan yang baku.
    const pdf = await generateIdCardPdf({
      nama: u.name,
      kodeUnik: u.kode_unik,
      fotoAbsolutePath,
      verifikasiUrl: `${baseUrl}/?verifikasi=${encodeURIComponent(u.kode_unik)}`,
    });

    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ID-Card-${u.kode_unik}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Gagal generate ID card:', error);
    return Response.json({ error: 'Gagal membuat ID card' }, { status: 500 });
  }
}
