import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat, isHopRole } from '@/lib/hopAuth';
import { pastikanKodeInviteSahabat } from '@/lib/kodeInvitePerwakilan';
import { relasiSemuaSahabat } from '@/lib/jaringanSahabat';

// GET /api/hop/sahabat?q=  — dashboard Head of Program Sahabat (dikonfirmasi
// user 2026-10-01): cari sahabat, total sahabat, & jumlah relasi Gen1-Gen5
// tiap sahabat (angka saja). SENGAJA cuma nama/kode/status/angka — gak ada
// no. telepon, NIK, rekening, atau saldo. Admin/super_admin juga boleh lihat.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
    const semua = await relasiSemuaSahabat(pool);

    const [laporan] = await pool.query(
      "SELECT sahabat_id, COUNT(*) AS n FROM sahabat_laporan_data WHERE status = 'terbuka' GROUP BY sahabat_id"
    );
    const laporanPer = new Map(laporan.map(l => [l.sahabat_id, Number(l.n)]));

    const items = semua
      .filter(s => !q || String(s.name || '').toLowerCase().includes(q) || String(s.kode_unik || '').toLowerCase().includes(q))
      .map(s => ({ ...s, laporan_terbuka: laporanPer.get(s.id) || 0 }))
      .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));

    // Link rekrut milik HoP sendiri (HoP = management, boleh mengajak Sahabat
    // baru seperti admin; rantai ujroh berhenti di HoP).
    const kodeUndangan = isHopRole(auth.user) ? await pastikanKodeInviteSahabat(pool, auth.user.id) : null;

    return Response.json({
      kode_undangan: kodeUndangan,
      ringkasan: {
        total_sahabat_aktif: semua.filter(s => s.status === 'active').length,
        total_dalam_proses: semua.filter(s => s.status !== 'active').length,
        laporan_terbuka: [...laporanPer.values()].reduce((a, b) => a + b, 0),
      },
      items,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
