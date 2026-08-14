'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/app/components/Layout';
import DaftarEditor from '@/app/components/DaftarEditor';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function AdminSkemaPembayaranPage() {
  const router = useRouter();
  const [user] = useCurrentUser();

  useEffect(() => {
    // user null krn localStorage belum kebaca di render pertama — bukan
    // berarti belum login (pola sama di halaman admin lain).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); }
  }, [user]);

  if (!user || !['admin','super_admin'].includes(user.role)) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <Layout title="🏠 Konten Landing Page" backHref="/admin/pengaturan/dokumen">
      <DaftarEditor
        judul="⭐ Kenapa JM Travel"
        deskripsiHalaman="4 card 'Kenapa JM Travel?' di landing page — bisa diklik pengunjung, buka modal berisi deskripsi + foto (mis. scan izin resmi, foto hotel, foto mutawwif, dll)."
        adminApiUrl="/api/admin/kenapa-jm-travel"
        imageUploadUrl="/api/admin/kenapa-jm-travel/upload-gambar"
        fields={[
          { key: 'judul', label: 'Judul Card', placeholder: 'Mis. Izin Resmi', wajib: true },
          { key: 'icon', label: 'Icon (emoji)', placeholder: 'Mis. 📋' },
          { key: 'deskripsi', label: 'Deskripsi (tampil di modal saat diklik)', placeholder: 'Jelaskan lebih detail...', textarea: true },
        ]}
        kolomTampil={{ judul: 'judul', sub: 'deskripsi' }}
      />

      <DaftarEditor
        judul="🎫 Fasilitas All-In"
        deskripsiHalaman="Daftar fasilitas yang tampil sebagai pill kecil di landing page (Tiket, Visa, Transportasi, dst)."
        adminApiUrl="/api/admin/fasilitas-all-in"
        fields={[
          { key: 'teks', label: 'Teks', placeholder: 'Mis. Full Handling Airport', wajib: true },
          { key: 'icon', label: 'Icon (emoji)', placeholder: 'Mis. 🛬' },
        ]}
        kolomTampil={{ judul: 'teks' }}
      />

      <DaftarEditor
        judul="🚀 Alur Pendaftaran"
        deskripsiHalaman="Langkah-langkah proses pendaftaran, ditampilkan di landing page SEBELUM section Program. Sengaja singkat per langkah (mis. 'DP Rp 5.000.000' tanpa rincian skema) — detail cara bayar ada di Skema Pembayaran di bawah, biar gak dobel."
        adminApiUrl="/api/admin/alur-pendaftaran"
        fields={[
          { key: 'judul', label: 'Judul Langkah', placeholder: 'Mis. Pilih Program', wajib: true },
          { key: 'deskripsi', label: 'Deskripsi Singkat', placeholder: 'Satu kalimat singkat...', wajib: true },
          { key: 'icon', label: 'Icon (emoji, opsional)', placeholder: 'Mis. 🕌' },
        ]}
        kolomTampil={{ judul: 'judul', sub: 'deskripsi' }}
      />

      <DaftarEditor
        judul="💰 Skema Pembayaran"
        deskripsiHalaman="Cara-cara bayar yang ditawarkan (lunas/DP, tabungan umroh, jadi mitra, cicilan syariah, dst) — beda dari Metode Pembayaran yang soal rekening tujuan. Ini konten penjelasan + tombol WA, gak ada proses otomatis di sistem."
        adminApiUrl="/api/admin/skema-pembayaran"
        fields={[
          { key: 'judul', label: 'Judul', placeholder: 'Mis. Tabungan Umroh', wajib: true },
          { key: 'deskripsi', label: 'Deskripsi', placeholder: 'Jelaskan skemanya...', wajib: true, textarea: true },
          { key: 'pesan_wa', label: 'Pesan WhatsApp (opsional, custom)', placeholder: 'Kosongkan buat pesan default' },
        ]}
        kolomTampil={{ judul: 'judul', sub: 'deskripsi' }}
      />

      <DaftarEditor
        judul="🎒 Perlengkapan Jamaah"
        deskripsiHalaman="Daftar perlengkapan yang dikirim ke jamaah setelah DP dikonfirmasi — tampil di landing page."
        adminApiUrl="/api/admin/perlengkapan-jamaah"
        imageUploadUrl="/api/admin/perlengkapan-jamaah/upload-gambar"
        fields={[
          { key: 'nama', label: 'Nama Item', placeholder: 'Mis. Koper, Kain Ihram', wajib: true },
          { key: 'deskripsi', label: 'Deskripsi (opsional)', placeholder: 'Mis. ukuran, bahan, dll' },
        ]}
        kolomTampil={{ judul: 'nama', sub: 'deskripsi' }}
      />
    </Layout>
  );
}
