<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Backend ada di jm-travel-api (Go), bukan di repo ini

Repo ini FE. Semua perubahan backend — endpoint baru, field respons, logika server, migrasi DB —
dibuat di repo `jm-travel-api` (Go), kecuali user minta eksplisit per tugas.

- Di dev & prod, Caddy (`jm-travel-api/deploy/caddy/Caddyfile.tahap2`, matcher `@go` /
  `@go_programs`) mengirim sebagian `/api/*` ke Go. Route Next.js di path itu tidak pernah jalan;
  mengeditnya = perubahan diam-diam tidak berlaku (kasus 2026-10-20: field referral agen ditambah
  di `src/app/api/profil/route.js`, padahal `/api/profil` dilayani Go).
- Route seperti itu sudah dihapus dan dijaga `npm run cek:route-go` (juga dijalankan saat
  auto-deploy; gagal = deploy batal). Kalau sebuah path pindah ke Go, hapus route Next.js-nya.
- Endpoint yang belum ada di Go (mis. `/api/bookings*`, `/api/auth/register`): jangan tambah fitur
  backend baru di route Next.js-nya — porting dulu ke Go, atau tanya user.
- Sebelum mengubah respons API yang dipakai halaman, cek dulu path itu dilayani Go atau Next.js.
- `next dev` lokal: set `GO_API_URL` (lihat `.env.example`) dan jalankan jm-travel-api lokal.
