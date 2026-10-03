import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { buatPdfSpkAkUntukUser } from '@/lib/pdfDokumen/spkAkUntukUser';
import { buatPdfSkCifPemblokiranUntukUser, buatPdfFormulirBsiUntukUser, mergePdfBuffers } from '@/lib/pdfDokumen/dokumenSahabatGabungan';

// GET /api/sahabat/dokumen-legal/unduh-lengkap?user_id=X — PDF gabungan
// KETIGA dokumen Sahabat Baitullah (SPK-AK + SK-CIF + Surat Pemblokiran)
// jadi SATU file, dipakai di step "Metode TTD & Kirim Dokumen" (dikonfirmasi
// user 2026-10-02) biar jamaah bisa baca & unduh ketiganya dari 1 tempat
// tanpa gonta-ganti halaman. TIDAK menggantikan unduhan per-dokumen yang
// sudah ada (/api/sahabat/unduh-spk-ak, /api/sahabat/dokumen-legal/pdf-otomatis)
// — itu tetap tersedia buat yang mau unduh terpisah.
//
// ?user_id= (opsional, admin/super_admin ONLY) — dipakai admin buat CETAK
// dokumen anggota yang pilih metode TTD "Datang Kantor" (dikonfirmasi user
// 2026-10-03: sebelumnya gak ada cara admin ngeprint dokumen buat jamaah
// yang mau TTD langsung di kantor, cuma bisa dilakuin anggotanya sendiri).
// Tanpa param ini, selalu dokumen milik akun yang login (self).
export async function GET(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('user_id');
    let targetUserId = auth.user.id;
    if (userIdParam && String(userIdParam) !== String(auth.user.id)) {
      if (!['admin', 'super_admin'].includes(auth.user.role)) {
        return Response.json({ error: 'Anda tidak berwenang atas dokumen ini' }, { status: 403 });
      }
      targetUserId = userIdParam;
    }

    const { pdfBuffer: spkAkBuffer } = await buatPdfSpkAkUntukUser(pool, targetUserId);
    const skCifPemblokiranBuffer = await buatPdfSkCifPemblokiranUntukUser(pool, targetUserId);
    const buffers = [spkAkBuffer, skCifPemblokiranBuffer];

    // Dokumen ke-4: Formulir Pendaftaran Rekening BSI -- cuma relevan buat
    // jamaah yang udah setuju bantuan BSI manual (dikonfirmasi user
    // 2026-10-03), bukan semua orang.
    const [[u]] = await pool.query('SELECT bantuan_bsi_manual_disetujui_at FROM users WHERE id = ?', [targetUserId]);
    if (u?.bantuan_bsi_manual_disetujui_at) {
      buffers.push(await buatPdfFormulirBsiUntukUser(pool, targetUserId));
    }

    const gabungan = await mergePdfBuffers(buffers);

    return new Response(gabungan, {
      // no-store wajib — tanpa ini browser bisa nge-cache PDF dinamis ini
      // (bug nyata 2026-10-03: admin masih lihat versi lama walau server
      // udah dideploy ulang).
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Dokumen-Lengkap-Sahabat-Baitullah.pdf"', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
