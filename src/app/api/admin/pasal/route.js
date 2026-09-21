import pool from '@/lib/db';
import { wajibRole } from '@/lib/auth';
import { kolomSignerUntuk, ambilSignerSkCif } from '@/lib/signerKolom';

const DOKUMEN_VALID = ['spka_ins', 'jamaah', 'spk_ak', 'sk_cif', 'surat_pemblokiran', 'spk_ak_nonis'];
// surat_pemblokiran cuma 1 pihak yang TTD (si member) — gak ada blok
// "PIHAK PERTAMA JM Travel", jadi gak perlu signer institusi. sk_cif
// 2-pihak (Pemberi Kuasa/jamaah vs Penerima Kuasa, penandatangan sendiri
// nama_penandatangan_sk_cif dkk) — dikonfirmasi user 2026-09-10, lihat
// catatan lengkap di pasalUntukCetak.js. jamaah (SPJ) 2-pihak, spk_ak
// 3-pihak.
const SATU_PIHAK = ['surat_pemblokiran'];

// GET /api/admin/pasal?dokumen=spka
// GET /api/admin/pasal?dokumen=spka&ref_id=<user_id|booking_id> — dipakai
// halaman cetak (cetak-pks-mitra, cetak-perjanjian): kalau dokumen ini
// SUDAH dibekukan (lihat lib/pasalSnapshot.js) buat ref_id itu, balikin isi
// yang dibekukan (gak ikut perubahan pasal terbaru). Kalau belum pernah
// dibekukan, fallback ke isi live (dokumen belum "resmi jadi").
export async function GET(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const dokumen = searchParams.get('dokumen');
  const refId = searchParams.get('ref_id');
  if (!DOKUMEN_VALID.includes(dokumen)) {
    return Response.json({ error: 'Parameter dokumen tidak valid' }, { status: 400 });
  }
  try {
    if (!refId) {
      const [rows] = await pool.query(
        'SELECT nomor, tipe, judul, isi, updated_at FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
        [dokumen]
      );
      return Response.json({ pasal: rows });
    }

    const [snapshotRows] = await pool.query(
      'SELECT nomor, tipe, judul, isi FROM dokumen_pasal_snapshot WHERE ref_id = ? AND dokumen = ? ORDER BY nomor ASC',
      [refId, dokumen]
    );

    if (snapshotRows.length > 0) {
      let signerRow = null;
      if (dokumen === 'sk_cif') {
        [[signerRow]] = await pool.query('SELECT nama, nik, jabatan, created_at FROM dokumen_signer_snapshot WHERE ref_id = ? AND dokumen = ?', [refId, dokumen]);
      } else if (!SATU_PIHAK.includes(dokumen)) {
        [[signerRow]] = await pool.query('SELECT nama, jabatan, head_of_agency_nama, head_of_agency_jabatan, created_at FROM dokumen_signer_snapshot WHERE ref_id = ? AND dokumen = ?', [refId, dokumen]);
      }
      return Response.json({
        pasal: snapshotRows,
        signer: signerRow ? { nama: signerRow.nama, jabatan: signerRow.jabatan, nik: signerRow.nik } : null,
        headOfAgency: signerRow?.head_of_agency_nama ? { nama: signerRow.head_of_agency_nama, jabatan: signerRow.head_of_agency_jabatan } : null,
        dibekukan: true,
        dibekukan_at: signerRow?.created_at || null,
      });
    }

    // Belum pernah dibekukan — fallback ke isi live + pengaturan saat ini.
    const [liveRows] = await pool.query(
      'SELECT nomor, tipe, judul, isi FROM dokumen_pasal WHERE dokumen = ? ORDER BY nomor ASC',
      [dokumen]
    );
    let signer = null;
    if (dokumen === 'sk_cif') {
      signer = await ambilSignerSkCif(pool);
    } else if (!SATU_PIHAK.includes(dokumen)) {
      const kolom = kolomSignerUntuk(dokumen);
      const selectCols = [kolom.nama, kolom.jabatan].filter(Boolean).join(', ');
      const [[pengaturan]] = await pool.query(`SELECT ${selectCols} FROM pengaturan WHERE id = 1`);
      signer = pengaturan
        ? { nama: pengaturan[kolom.nama], jabatan: pengaturan[kolom.jabatan] }
        : null;
    }
    // headOfAgency: dulu khusus dokumen 'spka' (agen) — dokumen itu sudah
    // dihapus, jadi tidak ada lagi jalur yang butuh field ini.
    return Response.json({ pasal: liveRows, signer, headOfAgency: null, dibekukan: false, dibekukan_at: null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// PUT /api/admin/pasal — update judul & isi 1 pasal (dokumen+nomor jadi
// kunci, TIDAK menambah/menghapus/reorder pasal).
export async function PUT(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { dokumen, nomor, judul, isi } = await request.json();
    if (!DOKUMEN_VALID.includes(dokumen) || !nomor || !judul?.trim() || !isi?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [result] = await pool.query(
      'UPDATE dokumen_pasal SET judul = ?, isi = ? WHERE dokumen = ? AND nomor = ?',
      [judul.trim(), isi.trim(), dokumen, nomor]
    );
    if (result.affectedRows === 0) {
      return Response.json({ error: 'Pasal tidak ditemukan' }, { status: 404 });
    }
    return Response.json({ message: 'Pasal disimpan!' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// Tipe tampilan default per dokumen kalau admin nambah pasal baru — admin
// GAK perlu milih ini manual (dikonfirmasi user 2026-09-09), sistem yang
// nebak dari jenis dokumennya. Dokumen surat-pernyataan (sk_cif/
// surat_pemblokiran) defaultnya 'isian' (TANPA "Pasal N" — poin bernomor
// cukup ditulis pakai sintaks "- item" di 1 baris isi, otomatis jadi list
// bernomor lewat parsePasalMarkup, gak butuh tipe terpisah).
function tipeDefaultUntuk(dokumen) {
  return (dokumen === 'sk_cif' || dokumen === 'surat_pemblokiran') ? 'isian' : 'pasal';
}

// POST /api/admin/pasal — tambah pasal baru di AKHIR daftar (nomor =
// MAX(nomor)+1). Buat naruh di posisi lain, tambah dulu baru pakai PATCH
// (naik/turun) buat geser ke posisi yang diinginkan.
export async function POST(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { dokumen, judul, isi } = await request.json();
    if (!DOKUMEN_VALID.includes(dokumen) || !judul?.trim() || !isi?.trim()) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const [[{ maxNomor }]] = await pool.query(
      'SELECT COALESCE(MAX(nomor), 0) AS maxNomor FROM dokumen_pasal WHERE dokumen = ?',
      [dokumen]
    );
    const nomorBaru = maxNomor + 1;
    await pool.query(
      'INSERT INTO dokumen_pasal (dokumen, nomor, tipe, judul, isi) VALUES (?, ?, ?, ?, ?)',
      [dokumen, nomorBaru, tipeDefaultUntuk(dokumen), judul.trim(), isi.trim()]
    );
    return Response.json({ message: 'Pasal ditambahkan!', nomor: nomorBaru });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// DELETE /api/admin/pasal?dokumen=spka&nomor=3 — hapus 1 pasal, lalu
// nomor pasal SESUDAHNYA digeser turun 1 biar tetap berurutan tanpa bolong
// (mis. Pasal 4 jadi Pasal 3, Pasal 5 jadi Pasal 4, dst). Renumber jalan
// ASCENDING (dari yang paling dekat ke slot kosong) biar gak pernah nabrak
// unique key (dokumen, nomor) yang masih ada.
export async function DELETE(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const dokumen = searchParams.get('dokumen');
  const nomor = Number(searchParams.get('nomor'));
  if (!DOKUMEN_VALID.includes(dokumen) || !nomor) {
    return Response.json({ error: 'Parameter tidak valid' }, { status: 400 });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('DELETE FROM dokumen_pasal WHERE dokumen = ? AND nomor = ?', [dokumen, nomor]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return Response.json({ error: 'Pasal tidak ditemukan' }, { status: 404 });
    }
    const [sisa] = await conn.query(
      'SELECT nomor FROM dokumen_pasal WHERE dokumen = ? AND nomor > ? ORDER BY nomor ASC',
      [dokumen, nomor]
    );
    for (const row of sisa) {
      await conn.query('UPDATE dokumen_pasal SET nomor = nomor - 1 WHERE dokumen = ? AND nomor = ?', [dokumen, row.nomor]);
    }
    await conn.commit();
    return Response.json({ message: 'Pasal dihapus!' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  } finally {
    conn.release();
  }
}

// PATCH /api/admin/pasal — geser urutan pasal naik/turun (tukar nomor
// dengan tetangganya). Pakai nomor sementara (di luar rentang wajar) buat
// hindari tabrakan unique key (dokumen, nomor) pas tukar posisi.
export async function PATCH(request) {
  const auth = wajibRole(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { dokumen, nomor, arah } = await request.json();
    if (!DOKUMEN_VALID.includes(dokumen) || !nomor || !['naik', 'turun'].includes(arah)) {
      return Response.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }
    const nomorTetangga = arah === 'naik' ? nomor - 1 : nomor + 1;
    if (nomorTetangga < 1) {
      return Response.json({ error: 'Pasal ini sudah paling atas' }, { status: 400 });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[tetangga]] = await conn.query(
        'SELECT nomor FROM dokumen_pasal WHERE dokumen = ? AND nomor = ?',
        [dokumen, nomorTetangga]
      );
      if (!tetangga) {
        await conn.rollback();
        return Response.json({ error: 'Pasal ini sudah paling ' + (arah === 'naik' ? 'atas' : 'bawah') }, { status: 400 });
      }
      const TEMP = -999;
      await conn.query('UPDATE dokumen_pasal SET nomor = ? WHERE dokumen = ? AND nomor = ?', [TEMP, dokumen, nomor]);
      await conn.query('UPDATE dokumen_pasal SET nomor = ? WHERE dokumen = ? AND nomor = ?', [nomor, dokumen, nomorTetangga]);
      await conn.query('UPDATE dokumen_pasal SET nomor = ? WHERE dokumen = ? AND nomor = ?', [nomorTetangga, dokumen, TEMP]);
      await conn.commit();
      return Response.json({ message: 'Urutan pasal diperbarui!' });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
