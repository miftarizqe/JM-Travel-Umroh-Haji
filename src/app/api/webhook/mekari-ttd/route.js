import pool from '@/lib/db';
import { selesaikanSesiTtdById } from '@/lib/eSignature/selesaikanSesi';

// POST /api/webhook/mekari-ttd
// Endpoint yang didaftarkan sebagai callback URL di dashboard/API request
// Mekari Sign (bukan tombol UI) — dipanggil server mereka begitu status
// dokumen berubah, termasuk "signed". Menggantikan trigger manual mock
// (POST /api/dokumen-signature/[id]/selesaikan) KHUSUS untuk sesi yang
// provider-nya "mekari" — sesi mock tetap pakai tombol manual seperti biasa.
//
// TODO SEBELUM LIVE (isi begitu akun Sandbox Mekari Sign aktif & docs
// lengkap kebuka — per 2026-09-28 baru bisa diakses setelah tim mereka
// approve request Sandbox):
// 1) Field ID dokumen di payload webhook — di bawah ini ditulis
//    payload?.document_id sebagai TEMPAT DUGA (Mekari sebut "document_id"
//    di endpoint eSignature API-nya), ganti sesuai field asli webhook.
// 2) Nilai status "sudah ditandatangani" — halaman publik Mekari sebut ada
//    status sent/viewed/signed/declined, di bawah dianggap 'signed', cek ulang.
// 3) Verifikasi keaslian request (WAJIB sebelum live). Cek docs apakah Mekari
//    kirim signature/secret di header — ganti blok `verifikasiAsalWebhook`
//    di bawah. Untuk sementara dipagari shared-secret sederhana lewat header
//    x-webhook-secret vs env MEKARI_WEBHOOK_SECRET.
// 4) Daftarkan URL endpoint ini (https://jmtourtravel.com/api/webhook/mekari-ttd)
//    sebagai callback_url di request kirim dokumen (lihat providers/mekari.js).

function verifikasiAsalWebhook(request) {
  const secretDiharapkan = process.env.MEKARI_WEBHOOK_SECRET;
  if (!secretDiharapkan) return false; // belum dikonfigurasi = tolak semua, jangan diam-diam lolos
  return request.headers.get('x-webhook-secret') === secretDiharapkan;
}

export async function POST(request) {
  if (!verifikasiAsalWebhook(request)) {
    return Response.json({ error: 'Verifikasi webhook gagal' }, { status: 401 });
  }

  try {
    const payload = await request.json();

    // TODO: sesuaikan nama field dengan payload asli Mekari Sign.
    const providerRef = payload?.document_id;
    const status = payload?.status;
    if (!providerRef) return Response.json({ error: 'Payload tidak lengkap' }, { status: 400 });

    // Hanya proses kalau statusnya memang "selesai ditandatangani" —
    // TODO: ganti 'signed' sesuai nilai status asli Mekari kalau berbeda.
    if (status !== 'signed') {
      return Response.json({ message: `Status "${status}" diterima, belum memicu penyelesaian sesi.` });
    }

    const [[sig]] = await pool.query(
      `SELECT id FROM dokumen_signature WHERE ttd_provider = 'mekari' AND ttd_provider_ref = ?`,
      [providerRef]
    );
    if (!sig) return Response.json({ error: 'Sesi tanda tangan tidak ditemukan untuk providerRef ini' }, { status: 404 });

    await selesaikanSesiTtdById(sig.id, { actor: null });

    return Response.json({ message: 'Sesi TTD ditandai selesai.' });
  } catch (error) {
    if (error.status) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
