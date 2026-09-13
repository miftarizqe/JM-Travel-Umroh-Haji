import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { daftarJamaahPerluKit, tandaiPengirimanJamaah, kategoriProgramUntukBooking } from '@/lib/perlengkapan';
import { catatAudit } from '@/lib/audit';

// GET /api/admin/perlengkapan-pengiriman?program=<nama> — daftar jamaah
// (DP confirmed) + status pengiriman kit masing-masing. Admin BIASA boleh
// akses ini (beda dari /api/admin/perlengkapan yang khusus super_admin) —
// operasional harian packing/kirim, tidak perlu lihat angka stok gudang.
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const program = searchParams.get('program');
    const rows = await daftarJamaahPerluKit(pool, program || undefined);
    return Response.json({ jamaah: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH /api/admin/perlengkapan-pengiriman
// body: { booking_id, jamaah_idx, jk, status, item_ids?, catatan? }
// Maju 1 step ('belum_diproses' -> 'disiapkan' -> 'dikirim' -> 'diterima').
// `item_ids` cuma dipakai/wajib pas status='dikirim' — hasil checklist admin
// di UI (contreng satu-satu atau "Pilih Semua"), kalau kosong default ke
// semua item yang berlaku ke gender jamaah (lihat tandaiPengirimanJamaah).
// Begitu status='dikirim', stok gudang otomatis berkurang di belakang layar
// — admin di sini tidak perlu tahu angkanya.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { booking_id, jamaah_idx, jk, status, item_ids, catatan } = await request.json();
    if (!booking_id || jamaah_idx == null || !status) {
      return Response.json({ error: 'booking_id, jamaah_idx, dan status wajib diisi' }, { status: 400 });
    }
    const kategoriProgram = await kategoriProgramUntukBooking(pool, booking_id);
    await tandaiPengirimanJamaah(pool, {
      bookingId: booking_id, jamaahIdx: jamaah_idx, jk, kategoriProgram, statusBaru: status, itemIds: item_ids, catatan, actorId: auth.user.id,
    });
    await catatAudit(pool, {
      actor: auth.user, aksi: 'perlengkapan_pengiriman_update', target_type: 'booking', target_id: booking_id,
      keterangan: `Jamaah idx ${jamaah_idx} -> ${status}${status === 'dikirim' && item_ids ? ` (${item_ids.length} item dicontreng)` : ''}`,
    });
    return Response.json({ message: 'Status pengiriman diperbarui!' });
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return Response.json({ error: error.status ? error.message : 'Terjadi kesalahan server' }, { status });
  }
}
