import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import pool from '@/lib/db';
import { wajibLogin } from '@/lib/auth';
import { catatRekening } from '@/lib/rekeningLedger';
import { kirimNotifikasiAdmin } from '@/lib/notifikasi';

const TIPE_OK = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAKS = 10 * 1024 * 1024;

// POST /api/sahabat/upload-bukti-tf  (multipart: file)
// Self-service, wajibLogin — bukti transfer Rp1.000.000 pendaftaran
// sahabat, milik akun yang lagi login sendiri (bukan admin, gak butuh
// user_id di body).
//
// Sahabat Baitullah CUMA bisa daftar via referral (bukan publik random),
// jadi TF gak lagi butuh verifikasi admin sebelum lanjut (dikonfirmasi
// user 2026-09-02) — begitu file keupload, langsung dianggap terverifikasi
// & status auto-maju ke 'menunggu_sk_cif' (step 'menunggu_bsi' DIHAPUS
// 2026-09-19 — gerbang toggle admin akun_bsi_status/tabungan_haji_status
// sebelum jamaah bisa isi CIF dicabut, langsung lompat ke sini). Gate
// kepercayaan dipindah ke 2 titik lain: ACC voucher (disetujui_at, lihat
// project_voucher_sejuta_auto_generate) dan aktivasi akun (advance ke
// 'active', tetap wajib CIF+baca-setuju SK-CIF/Surat Kuasa Blokir + aksi
// admin). Admin masih bisa 'reject' pendaftaran kapan saja kalau ternyata
// bukti TF-nya bermasalah — itu jaring pengamannya sekarang, bukan gate
// di muka.
export async function POST(request) {
  const auth = wajibLogin(request);
  if (auth.error) return auth.error;

  try {
    const [[pendaftaran]] = await pool.query(
      'SELECT id, bukti_tf_verified_at FROM sahabat_pendaftaran WHERE user_id = ?',
      [auth.user.id]
    );
    if (!pendaftaran) {
      return Response.json({ error: 'Isi data diri pendaftaran sahabat terlebih dahulu' }, { status: 400 });
    }
    // Boleh DIGANTI selama belum tahap akhir (dikonfirmasi user 2026-10-08)
    // — sebelumnya dikunci total begitu terverifikasi (auto-verify, lihat
    // komentar di bawah). "Tahap akhir" = metodeTtdSelesai, SAMA PERSIS
    // definisinya kayak di status-pendaftaran-sahabat/page.jsx.
    if (pendaftaran.bukti_tf_verified_at) {
      const [[u]] = await pool.query(
        `SELECT agama, metode_ttd_sahabat, dokumen_spk_ak_fisik_diterima_at,
                dokumen_cif_fisik_diterima_at, dokumen_pemblokiran_fisik_diterima_at
         FROM users WHERE id = ?`, [auth.user.id]
      );
      const dokumenSpkAk = u.agama === 'non_islam' ? 'spk_ak_nonis' : 'spk_ak';
      const [[sigSpkAk]] = await pool.query(
        `SELECT fase FROM dokumen_signature WHERE dokumen = ? AND rangkap = 'tunggal' AND ref_id = ? ORDER BY id DESC LIMIT 1`,
        [dokumenSpkAk, auth.user.id]
      );
      const spkAkSelesai = (sigSpkAk?.fase === 'selesai') || !!u.dokumen_spk_ak_fisik_diterima_at;
      const dokumenKetigaSelesai = spkAkSelesai && !!u.dokumen_cif_fisik_diterima_at && !!u.dokumen_pemblokiran_fisik_diterima_at;
      const metodeTtdSelesai = u.metode_ttd_sahabat === 'kantor' || (u.metode_ttd_sahabat === 'kirim' && dokumenKetigaSelesai);
      if (metodeTtdSelesai) {
        return Response.json({ error: 'Pendaftaran sudah sampai tahap akhir (Metode TTD selesai), bukti transfer tidak bisa diganti lagi. Hubungi admin kalau ada yang perlu dikoreksi.' }, { status: 400 });
      }
    }

    // Ditentuin SEBELUM UPDATE di bawah — dipakai buat skip langkah yang
    // cuma relevan buat unggahan PERTAMA (status_log & ledger masuk Rp1jt),
    // supaya ganti bukti TF gak dobel-catet setoran atau nge-reset status
    // funnel yang udah lanjut (mis. udah 'active') balik ke 'menunggu_sk_cif'.
    const unggahanPertama = !pendaftaran.bukti_tf_verified_at;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }
    if (!TIPE_OK.includes(file.type)) {
      return Response.json({ error: 'File harus JPG, PNG, atau PDF' }, { status: 400 });
    }
    if (file.size > MAKS) {
      return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
    }

    // Kategori storage SENGAJA dibiarkan 'bukti-tf-koperasi' (bukan ikut
    // rename) — bukti TF yang SUDAH terupload pakai prefix ini, lihat
    // catatan sama di upload-dokumen-sahabat-fisik/route.js.
    const dir = path.join(process.cwd(), 'private-uploads', 'bukti-tf-koperasi');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const ext = path.extname(file.name || '') || (file.type === 'application/pdf' ? '.pdf' : '.jpg');
    const nama = `buktitf_${auth.user.id}_${Date.now()}${ext}`;
    await writeFile(path.join(dir, nama), Buffer.from(await file.arrayBuffer()));

    const publicPath = `/api/dokumen/bukti-tf-koperasi/${nama}`;
    if (unggahanPertama) {
      await pool.query(
        `UPDATE sahabat_pendaftaran
         SET bukti_tf_path = ?, bukti_tf_uploaded_at = NOW(), bukti_tf_verified_at = NOW(), status = 'menunggu_sk_cif'
         WHERE user_id = ?`,
        [publicPath, auth.user.id]
      );
      await pool.query(
        "INSERT INTO pendaftaran_status_log (tipe, user_id, status_baru, catatan) VALUES ('sahabat_baitullah', ?, 'menunggu_sk_cif', 'Bukti transfer diunggah — auto-lanjut (referral, tanpa gate admin)')",
        [auth.user.id]
      );

      // Rekening Sahabat Baitullah — uang masuk (setoran Rp1jt pendaftaran),
      // dikonfirmasi user 2026-09-02. Nominal hardcode 1000000 sama kayak
      // potongan voucher auto-generate di status-pendaftaran-sahabat/route.js
      // (SATU sumber angka yang sama, jangan baca dari tempat lain). CUMA
      // dicatat di unggahan PERTAMA — ganti bukti TF bukan setoran baru.
      await catatRekening(pool, {
        rekening: 'sahabat_baitullah', jenis: 'masuk', sumber_tipe: 'setoran_pendaftaran',
        sumber_id: auth.user.id, nominal: 1000000,
        keterangan: `Setoran pendaftaran Rp1.000.000 — ${auth.user.name || auth.user.id}`,
      });
    } else {
      // Ganti bukti — cuma file & timestamp-nya yang diupdate, status funnel
      // yang udah lanjut (mis. udah 'active') TIDAK direset.
      await pool.query(
        `UPDATE sahabat_pendaftaran SET bukti_tf_path = ?, bukti_tf_uploaded_at = NOW() WHERE user_id = ?`,
        [publicPath, auth.user.id]
      );
    }

    // Notifikasi admin — sebelumnya GAK ADA di titik ini (ditemukan user
    // 2026-10-03). Bukti TF auto-verified (lihat komentar atas), tapi admin
    // tetap perlu tau biar bisa spot-check & 'reject' kalau ternyata
    // bermasalah -- itu jaring pengamannya, butuh notifikasi buat kepake.
    await kirimNotifikasiAdmin(pool, {
      tipe: 'sahabat_bukti_tf',
      judul: unggahanPertama ? 'Bukti Transfer Sahabat Baitullah Masuk' : 'Bukti Transfer Sahabat Baitullah Diganti',
      pesan: `${auth.user.name} ${unggahanPertama ? 'mengunggah' : 'mengganti'} bukti transfer Rp1.000.000 pendaftaran Sahabat Baitullah.`,
      link: '/admin/sahabat',
    }).catch(() => {});

    return Response.json({ message: unggahanPertama ? 'Bukti transfer berhasil diunggah, lanjut isi data blokir rekening!' : 'Bukti transfer berhasil diganti.', path: publicPath });
  } catch (error) {
    console.error('Upload bukti TF sahabat gagal:', error);
    return Response.json({ error: 'Gagal mengunggah bukti transfer' }, { status: 500 });
  }
}
