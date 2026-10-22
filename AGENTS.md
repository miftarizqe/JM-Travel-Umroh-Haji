<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Repo ini FRONTEND saja — backend ada di repo `jm-travel-api`

Sejak 2026-10-22 JM Travel dipecah jadi dua repo:

| Repo | Isi | Contoh file |
|---|---|---|
| **jm-travel-web** (repo ini) | halaman & komponen (UI) | `src/app/**/page.jsx`, `src/app/components/**`, `src/lib/use*.js` |
| **jm-travel-api** | SEMUA backend: route API, akses database, migrasi DB, job terjadwal, upload file | `src/app/api/**/route.js`, `src/lib/db.js`, `migrations/*.sql` |

## Aturan

- **Endpoint baru / ubah respons API / logika server / kolom & tabel baru → kerjakan di repo
  `jm-travel-api`**, bukan di sini. Panduannya: `PANDUAN-BACKEND.md` di repo itu.
- Halaman memanggil backend lewat `fetch('/api/...')` seperti biasa. Di dev & prod Caddy yang
  mengirim `/api/*`, `/uploads/*`, `/healthz` ke backend; lokal lewat `API_URL` (lihat bawah).
- Jangan menambah `src/app/api/`, `migrations/`, `route.js`, atau import `mysql2`/`bcryptjs`/
  `jsonwebtoken`/`@/lib/db` di repo ini. `npm run build` (juga build Docker saat deploy) **gagal**
  kalau ada — dijaga `scripts/cek-tanpa-backend.mjs`.
- Fitur yang butuh FE + BE: buat dua perubahan (dua PR), **deploy backend dulu**, baru frontend.
  Backend harus tetap kompatibel dengan frontend lama selama jeda itu (tambah field, jangan ganti
  nama/hapus field yang masih dipakai halaman).
- Beberapa helper murni ada salinannya di kedua repo (dipakai halaman & server), mis.
  `harga.js`, `kalkulatorBiaya.js`, `bookingStage.js`, `jamaahHarga.js`, `formatAlamat.js`,
  `terbilang.js`. Kalau mengubah aturan bisnis di salah satunya, ubah juga salinannya di repo lain.
  `src/lib/sesiCookie.js` = salinan helper cookie dari `src/lib/auth.js` backend.

## Menjalankan lokal

1. Jalankan backend dulu di repo `jm-travel-api`: `npm run dev` (port 3001, lihat README-nya).
2. Di repo ini: salin `.env.example` → `.env.local` (isi `API_URL=http://localhost:3001`), lalu
   `npm run dev` → http://localhost:3000.
