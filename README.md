# jm-travel-web — Frontend JM Travel

Halaman & komponen website JM Travel (Next.js). **Repo ini frontend saja.** Semua backend — route
API, database, migrasi, upload, job terjadwal — ada di repo **jm-travel-api**
(lihat `PANDUAN-BACKEND.md` di sana).

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local   # isi API_URL=http://localhost:3001 (backend lokal)
npm run dev                  # http://localhost:3000
```

Backend (`jm-travel-api`) harus jalan dulu: `npm run dev` di repo itu (port 3001). Semua
`fetch('/api/...')` dari halaman diteruskan ke `API_URL` oleh `next.config.ts`.

## Aturan tim

- Perubahan backend apa pun (endpoint, field respons, logika server, migrasi DB) → repo
  **jm-travel-api**. Build repo ini gagal kalau ada kode backend masuk (`scripts/cek-tanpa-backend.mjs`).
- Fitur FE + BE: deploy backend dulu, baru frontend.
- Detail lengkap untuk developer & AI coding assistant: `AGENTS.md`.

## Deploy

Push ke `dev` → dev.jmtourtravel.com, push ke `main` → jmtourtravel.com (GitHub Actions →
`jm-travel-api/deploy/auto-deploy.sh web <branch>`). Konfigurasi server (docker compose, Caddy)
ada di repo jm-travel-api folder `deploy/`.
