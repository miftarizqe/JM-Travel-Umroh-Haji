import pool from '@/lib/db';
import { selesaikanSesiTtdById } from '@/lib/eSignature/selesaikanSesi';

// POST /api/webhook/privy-ttd
// Endpoint yang didaftarkan ke PrivyID (bukan tombol UI) — dipanggil server
// PrivyID sendiri begitu penandatangan selesai TTD sebuah Envelope. Ini
// menggantikan trigger manual mock (POST /api/dokumen-signature/[id]/selesaikan)
// KHUSUS untuk sesi yang provider-nya "privy" — sesi mock tetap pakai tombol
// manual seperti biasa.
//
// TODO SEBELUM LIVE (isi begitu dashboard partner PrivyID aktif & docs.privy.id
// bisa dibuka — per 2026-09-28 portal itu masih minta login akun bisnis):
// 1) Field nama Envelope/dokumen di payload webhook PrivyID — di bawah ini
//    ditulis payload?.envelope_id sebagai TEMPAT DUGA, ganti sesuai field asli.
// 2) Field status "sudah selesai ditandatangani" — di bawah dianggap
//    payload?.status === 'completed', ganti sesuai nilai enum asli PrivyID.
// 3) Verifikasi keaslian request (WAJIB sebelum live — jangan biarkan endpoint
//    ini bisa dipanggil sembarang orang buat forge "sudah TTD"). PrivyID
//    biasanya kirim signature/secret di header — cek docs, ganti blok
//    `verifikasiAsalWebhook` di bawah. Untuk sementara dipagari shared-secret
//    sederhana lewat header x-webhook-secret vs env PRIVY_WEBHOOK_SECRET.
// 4) Daftarkan URL endpoint ini (https://jmtourtravel.com/api/webhook/privy-ttd)
//    di dashboard partner PrivyID sebagai callback URL.

function verifikasiAsalWebhook(request) {
  const secretDiharapkan = process.env.PRIVY_WEBHOOK_SECRET;
  if (!secretDiharapkan) return false; // belum dikonfigurasi = tolak semua, jangan diam-diam lolos
  return request.headers.get('x-webhook-secret') === secretDiharapkan;
}

export async function POST(request) {
  if (!verifikasiAsalWebhook(request)) {
    return Response.json({ error: 'Verifikasi webhook gagal' }, { status: 401 });
  }

  try {
    const payload = await request.json();

    // TODO: sesuaikan nama field dengan payload asli PrivyID.
    const providerRef = payload?.envelope_id;
    const status = payload?.status;
    if (!providerRef) return Response.json({ error: 'Payload tidak lengkap' }, { status: 400 });

    // Hanya proses kalau providernya memang menandakan "selesai ditandatangani" —
    // TODO: ganti 'completed' sesuai nilai status asli PrivyID kalau berbeda.
    if (status !== 'completed') {
      return Response.json({ message: `Status "${status}" diterima, belum memicu penyelesaian sesi.` });
    }

    const [[sig]] = await pool.query(
      `SELECT id FROM dokumen_signature WHERE ttd_provider = 'privy' AND ttd_provider_ref = ?`,
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
