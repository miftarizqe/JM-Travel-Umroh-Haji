import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { parseMutasiRekening } from '@/lib/parseMutasiRekening';
import { sarankanKategori } from '@/lib/klasifikasiCashflowKategori';

const MAKS = 10 * 1024 * 1024; // 10MB

function keTanggalStr(v) {
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// POST /api/admin/cashflow/transaksi/import/parse  (multipart: file, periode_id, akun_id)
// Ekstrak baris transaksi dari PDF rekening koran + sarankan kategori per
// baris (rule-based, lihat src/lib/klasifikasiCashflowKategori.js) — endpoint
// ini BELUM nyimpen apa pun ke cashflow_transaksi, cuma parse+saran. Admin
// review/edit hasilnya di frontend, baru POST /import/confirm buat commit.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const periodeId = Number(formData.get('periode_id'));
    const akunId = Number(formData.get('akun_id'));

    if (!file || typeof file === 'string') return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    if (file.type !== 'application/pdf') return Response.json({ error: 'File harus PDF' }, { status: 400 });
    if (file.size > MAKS) return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    if (!periodeId || !akunId) return Response.json({ error: 'periode_id dan akun_id wajib diisi' }, { status: 400 });

    const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [periodeId]);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa import transaksi' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { baris, kosong } = await parseMutasiRekening(buffer);

    if (kosong) {
      return Response.json({
        error: 'PDF ini kelihatannya hasil scan/gambar, bukan hasil export teks dari internet banking — coba export ulang mutasi rekeningnya dalam bentuk PDF/teks, bukan hasil foto/scan.',
      }, { status: 400 });
    }
    if (baris.length === 0) {
      return Response.json({
        error: 'Tidak ada baris transaksi yang terdeteksi di PDF ini. Format rekening korannya mungkin belum didukung parser — hubungi developer untuk penyesuaian.',
      }, { status: 400 });
    }

    const [kategoriRows] = await pool.query('SELECT * FROM cashflow_kategori WHERE aktif = 1');
    const [existingRows] = await pool.query(
      'SELECT tanggal, nominal FROM cashflow_transaksi WHERE periode_id = ? AND akun_id = ?',
      [periodeId, akunId]
    );
    const sudahAda = new Set(existingRows.map(e => `${keTanggalStr(e.tanggal)}|${e.nominal}`));

    const rows = baris.map(b => {
      const kategoriUntukTipe = kategoriRows.filter(k => k.tipe === b.tipe);
      const disarankan = sarankanKategori(b.deskripsi, kategoriUntukTipe);
      return {
        tanggal: b.tanggal,
        deskripsi: b.deskripsi,
        tipe: b.tipe,
        nominal: b.nominal,
        kategori_id: disarankan?.id || null,
        kategori_nama_disarankan: disarankan?.nama || null,
        yakin_parsing: b.yakin !== false,
        kemungkinan_duplikat: sudahAda.has(`${b.tanggal}|${b.nominal}`),
      };
    });

    return Response.json({ rows });
  } catch (error) {
    console.error('Parse mutasi rekening gagal:', error);
    return Response.json({ error: 'Gagal memproses file PDF' }, { status: 500 });
  }
}
