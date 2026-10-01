import pool from '@/lib/db';
import { wajibSuperAdmin } from '@/lib/auth';

const REKENING_VALID = ['alkhalid', 'sahabat_baitullah'];
// Baris ledger khusus penanda saldo awal manual (dikonfirmasi user
// 2026-10-01) — MAKSIMAL 1 baris per rekening (upsert, bukan insert
// berulang), biar gak dobel ke-hitung tiap kali admin edit angkanya.
// Beda dari cashflow_akun.saldo_awal: di sini gak ada konsep "rantai
// periode terkunci", jadi aman diedit kapan saja (langsung ngubah hasil
// hitungan saldo_awal/saldo_akhir bulan manapun yang relevan).
const SUMBER_SALDO_AWAL = 'saldo_awal_manual';

// GET ?rekening=alkhalid — nilai saldo awal manual saat ini (buat pre-fill form edit)
export async function GET(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const rekening = searchParams.get('rekening');
    if (!REKENING_VALID.includes(rekening)) return Response.json({ error: 'Rekening tidak valid' }, { status: 400 });
    const [[row]] = await pool.query(
      'SELECT id, nominal, created_at FROM rekening_ledger WHERE rekening = ? AND sumber_tipe = ? LIMIT 1',
      [rekening, SUMBER_SALDO_AWAL]
    );
    return Response.json({ saldo_awal: row || null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}

// POST { rekening, nominal, tanggal? } — set/update saldo awal rekening
// (upsert). `tanggal` (YYYY-MM-DD, default hari ini) nentuin baris ini
// kehitung mulai bulan apa — isi tanggal lampau kalau mau saldo awal ini
// berlaku dari sebelum bulan sekarang.
export async function POST(request) {
  const auth = wajibSuperAdmin(request);
  if (auth.error) return auth.error;
  try {
    const { rekening, nominal, tanggal } = await request.json();
    if (!REKENING_VALID.includes(rekening)) return Response.json({ error: 'Rekening tidak valid' }, { status: 400 });
    const nominalNum = Number(nominal);
    if (!Number.isFinite(nominalNum) || nominalNum < 0) {
      return Response.json({ error: 'Nominal harus angka dan tidak boleh negatif' }, { status: 400 });
    }
    const createdAt = tanggal ? `${tanggal} 00:00:00` : new Date();

    const [[existing]] = await pool.query(
      'SELECT id FROM rekening_ledger WHERE rekening = ? AND sumber_tipe = ? LIMIT 1',
      [rekening, SUMBER_SALDO_AWAL]
    );
    if (existing) {
      await pool.query('UPDATE rekening_ledger SET nominal = ?, created_at = ? WHERE id = ?', [nominalNum, createdAt, existing.id]);
    } else {
      await pool.query(
        `INSERT INTO rekening_ledger (rekening, jenis, sumber_tipe, nominal, keterangan, created_at)
         VALUES (?, 'masuk', ?, ?, ?, ?)`,
        [rekening, SUMBER_SALDO_AWAL, nominalNum, 'Saldo awal (input manual)', createdAt]
      );
    }
    return Response.json({ message: 'Saldo awal tersimpan.' });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
