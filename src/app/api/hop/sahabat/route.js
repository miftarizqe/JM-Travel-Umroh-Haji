import pool from '@/lib/db';
import { wajibAdminAtauHopSahabat, isHopRole } from '@/lib/hopAuth';
import { pastikanKodeInviteSahabat } from '@/lib/kodeInvitePerwakilan';
import { relasiSemuaSahabat, GEN_MAKS } from '@/lib/jaringanSahabat';

const BULAN_GRAFIK = 6;
const TOP_N = 5;
const HASIL_CARI_MAKS = 10;
const HARI_MS = 24 * 60 * 60 * 1000;

const kunciBulan = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// GET /api/hop/sahabat?q=  — dashboard Head of Program Sahabat (dikonfirmasi
// user 2026-10-01): total sahabat & jumlah relasi Gen1-Gen5 (angka saja).
// SENGAJA cuma nama/kode/status/angka — gak ada no. telepon, NIK, rekening,
// atau saldo. Admin/super_admin juga boleh lihat.
//
// Beranda HoP gak lagi nge-list semua sahabat (dikonfirmasi user 2026-10-15):
// tanpa `q` yang dikirim cuma ringkasan (KPI, pertumbuhan per bulan,
// kedalaman jaringan HoP, top perekrut, yang perlu perhatian). Daftar nama
// cuma muncul sebagai hasil cari (maks HASIL_CARI_MAKS) — daftar lengkap ada
// di /admin/sahabat/database.
export async function GET(request) {
  const auth = await wajibAdminAtauHopSahabat(request);
  if (auth.error) return auth.error;
  try {
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
    const semua = await relasiSemuaSahabat(pool);

    // Hitungan laporan cuma pelengkap — kalau gagal (mis. tabel belum
    // dimigrasi) dashboard tetap tampil, jangan ikut 500.
    let laporanPer = new Map();
    try {
      const [laporan] = await pool.query(
        "SELECT sahabat_id, COUNT(*) AS n FROM sahabat_laporan_data WHERE status = 'terbuka' GROUP BY sahabat_id"
      );
      laporanPer = new Map(laporan.map(l => [l.sahabat_id, Number(l.n)]));
    } catch (e) {
      console.error('Hitung laporan terbuka gagal:', e);
    }

    const publik = (s) => ({
      id: s.id, name: s.name, kode_unik: s.kode_unik, status: s.status,
      gen: s.gen, total: s.total, laporan_terbuka: laporanPer.get(s.id) || 0,
    });

    const aktif = semua.filter(s => s.status === 'active');
    const dalamProses = semua.filter(s => s.status !== 'active');

    // Pendaftar baru per bulan (BULAN_GRAFIK bulan terakhir, termasuk bulan ini).
    const sekarang = new Date();
    const pertumbuhan = [];
    for (let i = BULAN_GRAFIK - 1; i >= 0; i--) {
      const d = new Date(sekarang.getFullYear(), sekarang.getMonth() - i, 1);
      pertumbuhan.push({ bulan: kunciBulan(d), baru: 0 });
    }
    const idxBulan = new Map(pertumbuhan.map((p, i) => [p.bulan, i]));
    for (const s of semua) {
      if (!s.created_at) continue;
      const i = idxBulan.get(kunciBulan(new Date(s.created_at)));
      if (i !== undefined) pertumbuhan[i].baru++;
    }

    // Kedalaman jaringan dari akun HoP (rantai perekrut_id): sahabat aktif
    // per generasi di bawah HoP. Sahabat aktif yang gak nyambung ke HoP
    // (mis. daftar lewat link admin) dihitung terpisah.
    const [[peng]] = await pool.query('SELECT head_of_program_user_id FROM pengaturan WHERE id = 1');
    const hopId = peng?.head_of_program_user_id || (isHopRole(auth.user) ? auth.user.id : null);
    let kedalaman = null;
    if (hopId) {
      const anak = new Map();
      for (const s of aktif) {
        if (!s.perekrut_id) continue;
        if (!anak.has(s.perekrut_id)) anak.set(s.perekrut_id, []);
        anak.get(s.perekrut_id).push(s.id);
      }
      const gen = [];
      const terhubung = new Set();
      let level = [hopId];
      for (let g = 1; g <= GEN_MAKS; g++) {
        level = level.flatMap(id => anak.get(id) || []).filter(id => !terhubung.has(id));
        level.forEach(id => terhubung.add(id));
        gen.push(level.length);
      }
      // Lebih dalam dari GEN_MAKS tetap anggota jaringan, cuma gak dirinci.
      while (level.length) {
        level = level.flatMap(id => anak.get(id) || []).filter(id => !terhubung.has(id));
        level.forEach(id => terhubung.add(id));
      }
      kedalaman = { gen, di_luar_jaringan: aktif.filter(s => !terhubung.has(s.id)).length };
    }

    const top = [...aktif]
      .filter(s => s.total > 0)
      .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)))
      .slice(0, TOP_N)
      .map(publik);

    const tertua = dalamProses.reduce((min, s) => {
      const t = s.created_at ? new Date(s.created_at).getTime() : null;
      return t !== null && (min === null || t < min) ? t : min;
    }, null);

    let hasilCari = null;
    if (q) {
      const cocok = semua
        .filter(s => String(s.name || '').toLowerCase().includes(q) || String(s.kode_unik || '').toLowerCase().includes(q))
        .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
      hasilCari = { total: cocok.length, items: cocok.slice(0, HASIL_CARI_MAKS).map(publik) };
    }

    // Link rekrut milik HoP sendiri (HoP = management, boleh mengajak Sahabat
    // baru seperti admin; rantai ujroh berhenti di HoP).
    const kodeUndangan = isHopRole(auth.user) ? await pastikanKodeInviteSahabat(pool, auth.user.id) : null;

    const bulanIni = pertumbuhan[pertumbuhan.length - 1].baru;
    const bulanLalu = pertumbuhan[pertumbuhan.length - 2].baru;

    return Response.json({
      kode_undangan: kodeUndangan,
      ringkasan: {
        total_sahabat_aktif: aktif.length,
        total_dalam_proses: dalamProses.length,
        laporan_terbuka: [...laporanPer.values()].reduce((a, b) => a + b, 0),
        baru_bulan_ini: bulanIni,
        baru_bulan_lalu: bulanLalu,
      },
      pertumbuhan,
      kedalaman,
      top,
      perhatian: {
        dalam_proses: dalamProses.length,
        tertua_hari: tertua === null ? null : Math.floor((Date.now() - tertua) / HARI_MS),
      },
      hasil_cari: hasilCari,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
