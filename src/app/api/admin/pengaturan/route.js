import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';

// nama/identitas/jabatan_penandatangan_kuasa_cif SUDAH DIHAPUS dari sini
// (2026-09-09) — kolomnya di tabel pengaturan sudah di-DROP bareng
// penghapusan total surat_kuasa_cif, jangan ditambah balik.
const KOLOM = ['wa_kantor', 'bank_nama', 'bank_rekening', 'bank_atas_nama', 'alamat_kantor', 'ig_url', 'tiktok_url', 'fb_url', 'nama_penandatangan', 'jabatan_penandatangan', 'nama_head_of_agency', 'jabatan_head_of_agency', 'nama_perusahaan', 'telepon_kantor', 'email_kantor', 'nama_penandatangan_keuangan', 'jabatan_penandatangan_keuangan', 'head_of_program_user_id', 'nama_penandatangan_jamaah', 'jabatan_penandatangan_jamaah', 'nama_penandatangan_spk_ak', 'jabatan_penandatangan_spk_ak', 'jabatan_head_of_program', 'nama_penandatangan_sk_cif', 'nik_penandatangan_sk_cif', 'jabatan_penandatangan_sk_cif'];
// Kolom numerik (kurs) — beda dari KOLOM di atas yang semua teks, jadi
// di-parse Number() sendiri di PUT, bukan `|| null` on string kosong.
// komisi_sahabat_nominal SENGAJA gak dipakai lagi (diganti mekanisme
// 5 generasi Sahabat Baitullah di bawah) — kolomnya dibiarkan di DB, cuma
// gak diedit lewat sini lagi.
const KOLOM_ANGKA = [
  'kurs_sar_idr', 'kurs_usd_idr', 'komisi_sahabat_closing_persen',
  'sahabat_gen1_nominal', 'sahabat_gen2_nominal', 'sahabat_gen3_nominal', 'sahabat_gen4_nominal', 'sahabat_gen5_nominal',
  'sahabat_tabungan_awal_nominal', 'sahabat_head_of_program_nominal', 'sahabat_closing_langsung_hop_nominal',
];

// Nominal komisi Sahabat Baitullah — "angka fatal" (dikonfirmasi user
// 2026-08-29, gampang salah pencet berdampak ke duit banyak orang).
// Halaman edit-nya (/admin/sahabat/pengaturan-komisi) udah super_admin-only
// + wajib ketik ulang teks konfirmasi, tapi guard-nya WAJIB juga di server
// (bukan cuma UI) biar gak bisa dilewatin lewat panggilan API langsung oleh
// admin biasa.
const KOLOM_SENSITIF = [
  'komisi_sahabat_closing_persen',
  'sahabat_gen1_nominal', 'sahabat_gen2_nominal', 'sahabat_gen3_nominal', 'sahabat_gen4_nominal', 'sahabat_gen5_nominal',
  'sahabat_tabungan_awal_nominal', 'sahabat_head_of_program_nominal', 'sahabat_closing_langsung_hop_nominal',
  'head_of_program_user_id',
];

// GET /api/admin/pengaturan
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const [rows] = await pool.query('SELECT * FROM pengaturan WHERE id = 1');
    return Response.json({ pengaturan: rows[0] || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/pengaturan — update baris tunggal (id=1). Partial update:
// cuma kolom yang beneran ada di body yang di-SET, biar halaman Pengaturan
// Umum & Pengaturan Dokumen bisa save independen tanpa saling nge-null-kan
// field punya halaman lain.
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const kolomDikirim = KOLOM.filter(k => k in body);
    const kolomAngkaDikirim = KOLOM_ANGKA.filter(k => k in body);
    if (kolomDikirim.length === 0 && kolomAngkaDikirim.length === 0) {
      return Response.json({ error: 'Tidak ada field yang dikirim' }, { status: 400 });
    }
    const adaFieldSensitif = [...kolomDikirim, ...kolomAngkaDikirim].some(k => KOLOM_SENSITIF.includes(k));
    if (adaFieldSensitif && auth.user.role !== 'super_admin') {
      return Response.json({ error: 'Ubah nominal komisi Sahabat Baitullah cuma bisa dilakukan super_admin.' }, { status: 403 });
    }
    const setClause = [...kolomDikirim, ...kolomAngkaDikirim].map(k => `${k} = ?`).join(', ');
    // `Number(v) || null` SALAH buat kolom NOT NULL kalau nilainya legitimate
    // 0 (mis. matiin persentase closing langsung) — 0 falsy di JS jadi ketimpa
    // null, UPDATE-nya gagal (kolom NOT NULL). Cek eksplisit string kosong
    // aja yang jadi null, 0 tetap 0.
    const vals = [
      ...kolomDikirim.map(k => body[k] || null),
      ...kolomAngkaDikirim.map(k => {
        if (body[k] === '' || body[k] === null || body[k] === undefined) return null;
        const n = Number(body[k]);
        return Number.isFinite(n) ? n : null;
      }),
    ];
    await pool.query(`UPDATE pengaturan SET ${setClause} WHERE id = 1`, vals);
    return Response.json({ message: 'Pengaturan disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
