import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';
import { catatAudit } from '@/lib/audit';
import { pastikanPeriode } from '@/lib/cashflow';

async function ambilPeriode(id) {
  const [[periode]] = await pool.query('SELECT * FROM cashflow_periode WHERE id = ?', [id]);
  return periode;
}

// GET /api/admin/cashflow/transaksi?periode_id=X — transaksi 1 periode
// (Cashflow Bulanan, ber-akun).
// GET /api/admin/cashflow/transaksi?tanpa_akun=1 — transaksi "purchasing"
// (akun_id IS NULL, lihat halaman /admin/purchasing), lintas periode,
// terbaru duluan — gak butuh periode_id karena bukan konteks 1 bulan buku
// kas, cuma catatan bon.
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const tanpaAkun = searchParams.get('tanpa_akun') === '1';
    const periodeId = Number(searchParams.get('periode_id'));
    if (!tanpaAkun && !periodeId) return Response.json({ error: 'Parameter periode_id wajib diisi' }, { status: 400 });

    const where = tanpaAkun ? 't.akun_id IS NULL' : 't.periode_id = ?';
    const params = tanpaAkun ? [] : [periodeId];
    const order = tanpaAkun ? 'ORDER BY t.tanggal DESC, t.id DESC LIMIT 200' : 'ORDER BY t.tanggal ASC, t.id ASC';

    const [rows] = await pool.query(
      `SELECT t.*, a.nama AS akun_nama, u.name AS input_oleh_nama, k.nama AS kategori_nama,
              p.name AS program_nama,
              induk.deskripsi AS settlement_induk_deskripsi
       FROM cashflow_transaksi t
       LEFT JOIN cashflow_akun a ON a.id = t.akun_id
       LEFT JOIN users u ON u.id = t.input_oleh
       LEFT JOIN cashflow_kategori k ON k.id = t.kategori_id
       LEFT JOIN programs p ON p.id = t.program_id
       LEFT JOIN cashflow_transaksi induk ON induk.id = t.settlement_induk_id
       WHERE ${where}
       ${order}`,
      params
    );
    return Response.json({ transaksi: rows });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST — tambah 1 baris transaksi
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    let { periode_id } = body;
    const { tanggal, deskripsi, kategori_id, program_id, akun_id, tipe, nominal, bukti_path, bukti_nama, is_settlement, penerima_settlement, settlement_induk_id } = body;

    if (!tanggal || !deskripsi?.trim() || !['in', 'out'].includes(tipe) || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    // akun_id opsional (lihat migration-cashflow-akun-opsional.sql) — transaksi
    // "purchasing/realisasi" (bon owner, belanja perlengkapan) gak nempel akun
    // manapun. Transaksi ber-akun (Cashflow Bulanan asli) tetap wajib periode_id
    // eksplisit dari client (halaman itu selalu di dalam konteks 1 periode
    // yang lagi dibuka); transaksi TANPA akun boleh biarin periode_id kosong,
    // di-resolve/dibikin OTOMATIS dari bulan tanggal-nya biar admin gak perlu
    // ribet "buka periode" dulu buat sekadar nyatet bon.
    if (!periode_id) {
      if (akun_id) return Response.json({ error: 'periode_id wajib diisi' }, { status: 400 });
      const periodeOtomatis = await pastikanPeriode(pool, String(tanggal).slice(0, 7), auth.user.id);
      periode_id = periodeOtomatis.id;
    }

    const periode = await ambilPeriode(periode_id);
    if (!periode) return Response.json({ error: 'Periode tidak ditemukan' }, { status: 404 });
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa ditambah transaksi' }, { status: 400 });
    }

    if (settlement_induk_id) {
      const [[induk]] = await pool.query(
        'SELECT * FROM cashflow_transaksi WHERE id = ? AND periode_id = ? AND is_settlement = 1',
        [settlement_induk_id, periode_id]
      );
      if (!induk) return Response.json({ error: 'Settlement induk tidak ditemukan' }, { status: 400 });
    }

    const [result] = await pool.query(
      `INSERT INTO cashflow_transaksi
        (periode_id, tanggal, deskripsi, kategori_id, program_id, akun_id, tipe, nominal, bukti_path, bukti_nama, is_settlement, penerima_settlement, settlement_induk_id, input_oleh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [periode_id, tanggal, deskripsi.trim(), kategori_id || null, program_id || null, akun_id || null, tipe, Number(nominal), bukti_path || null, bukti_nama || null,
       is_settlement ? 1 : 0, penerima_settlement?.trim() || null, settlement_induk_id || null, auth.user.id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'tambah_transaksi_cashflow',
      target_type: 'cashflow_transaksi',
      target_id: result.insertId,
      keterangan: `${deskripsi.trim()} — ${tipe === 'out' ? '−' : '+'}Rp${Number(nominal).toLocaleString('id-ID')}${settlement_induk_id ? ' (rincian settlement)' : ''}`,
    });

    return Response.json({ message: 'Transaksi dicatat!', id: result.insertId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PATCH — toggle cepat 1 field aja tanpa buka form edit lengkap:
// - cetak_mode: "Rincian"/"Totalan" (khusus baris settlement)
// - tanpa_bon: tandai "lanjut tanpa bon" langsung dari kolom Bon di tabel
export async function PATCH(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { id, cetak_mode, tanpa_bon, bukti_path, bukti_nama } = await request.json();
    if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });

    const [[existing]] = await pool.query('SELECT * FROM cashflow_transaksi WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    const periode = await ambilPeriode(existing.periode_id);

    // Rotate/crop foto bon cuma benerin ORIENTASI TAMPILAN, bukan angka
    // finansial — makanya boleh tetap dilakuin walau periode-nya udah
    // dikunci (submitted), beda dari field lain di bawah yang diblokir.
    if (bukti_path !== undefined) {
      await pool.query('UPDATE cashflow_transaksi SET bukti_path = ?, bukti_nama = ? WHERE id = ?', [bukti_path, bukti_nama || existing.bukti_nama, id]);
      return Response.json({ message: 'Foto bon diperbarui!' });
    }

    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa diubah' }, { status: 400 });
    }

    if (cetak_mode !== undefined) {
      if (!['rincian', 'totalan'].includes(cetak_mode) || !existing.is_settlement) {
        return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
      }
      await pool.query('UPDATE cashflow_transaksi SET cetak_mode = ? WHERE id = ?', [cetak_mode, id]);
      return Response.json({ message: 'Mode cetak diperbarui!' });
    }

    if (tanpa_bon !== undefined) {
      await pool.query('UPDATE cashflow_transaksi SET tanpa_bon = ? WHERE id = ?', [tanpa_bon ? 1 : 0, id]);
      return Response.json({ message: 'Status bon diperbarui!' });
    }

    return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT — update 1 baris transaksi
export async function PUT(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { id, tanggal, deskripsi, kategori_id, program_id, akun_id, tipe, nominal, bukti_path, bukti_nama, is_settlement, penerima_settlement } = body;
    if (!id || !tanggal || !deskripsi?.trim() || !['in', 'out'].includes(tipe) || !nominal || Number(nominal) <= 0) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const [[existing]] = await pool.query('SELECT * FROM cashflow_transaksi WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    const periode = await ambilPeriode(existing.periode_id);
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa diubah' }, { status: 400 });
    }

    await pool.query(
      `UPDATE cashflow_transaksi
       SET tanggal = ?, deskripsi = ?, kategori_id = ?, program_id = ?, akun_id = ?, tipe = ?, nominal = ?, bukti_path = ?, bukti_nama = ?, is_settlement = ?, penerima_settlement = ?
       WHERE id = ?`,
      [tanggal, deskripsi.trim(), kategori_id || null, program_id || null, akun_id || null, tipe, Number(nominal), bukti_path || null, bukti_nama || null,
       is_settlement ? 1 : 0, penerima_settlement?.trim() || null, id]
    );

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'edit_transaksi_cashflow',
      target_type: 'cashflow_transaksi',
      target_id: id,
      keterangan: `${existing.deskripsi} (Rp${Number(existing.nominal).toLocaleString('id-ID')}) → ${deskripsi.trim()} (Rp${Number(nominal).toLocaleString('id-ID')})`,
    });

    return Response.json({ message: 'Transaksi diperbarui!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE ?id=X — kalau bagian dari transfer antar akun, kedua baris pasangannya
// ikut dihapus (satu transfer = satu peristiwa). Kalau induk settlement, tolak
// dulu selama masih ada anak breakdown (hapus anaknya dulu).
export async function DELETE(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'Parameter id wajib diisi' }, { status: 400 });
  try {
    const [[existing]] = await pool.query('SELECT * FROM cashflow_transaksi WHERE id = ?', [id]);
    if (!existing) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    const periode = await ambilPeriode(existing.periode_id);
    if (periode.status === 'submitted') {
      return Response.json({ error: 'Periode ini sudah dikunci, tidak bisa dihapus' }, { status: 400 });
    }

    const [[{ jumlahAnak }]] = await pool.query(
      'SELECT COUNT(*) AS jumlahAnak FROM cashflow_transaksi WHERE settlement_induk_id = ?', [id]
    );
    if (jumlahAnak > 0) {
      return Response.json({ error: 'Hapus dulu rincian breakdown-nya sebelum menghapus baris settlement ini' }, { status: 400 });
    }

    if (existing.transfer_pair_id) {
      await pool.query('DELETE FROM cashflow_transaksi WHERE transfer_pair_id = ?', [existing.transfer_pair_id]);
    } else {
      await pool.query('DELETE FROM cashflow_transaksi WHERE id = ?', [id]);
    }

    await catatAudit(pool, {
      actor: auth.user,
      aksi: 'hapus_transaksi_cashflow',
      target_type: 'cashflow_transaksi',
      target_id: id,
      keterangan: `${existing.deskripsi} — Rp${Number(existing.nominal).toLocaleString('id-ID')} (${existing.tipe})${existing.transfer_pair_id ? ', termasuk pasangan transfernya' : ''}`,
    });

    return Response.json({ message: 'Transaksi dihapus!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
