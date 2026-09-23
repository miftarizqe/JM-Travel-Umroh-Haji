# Menampilkan jmtourtravel.com (Next.js di VPS, lewat Docker + Caddy)

Domain tadinya ke GitHub Pages (makanya yang tampil README). Next.js butuh server Node,
jadi jalan sebagai container `web` di compose yang sama dengan `caddy`, `api`, `db`.

Kerjakan berurutan; tiap langkah ada cara cek.

## Langkah 1 — Siapkan database untuk Next.js  (di VPS)
Next.js memakai skema MySQL lama; backend Go memakai MariaDB `db`. Untuk tahap 1, buat
database + user khusus Next.js di MariaDB itu lalu isi dengan dump DB lama (`jm_travel`):
    docker compose exec db mariadb -uroot -p -e "CREATE DATABASE jm_travel; \
      CREATE USER 'jm_web'@'%' IDENTIFIED BY '<password>'; GRANT ALL ON jm_travel.* TO 'jm_web'@'%';"
    # dump dari DB lama (di mesin lama):  mysqldump -uroot -p jm_travel > jm_travel.sql
    docker compose exec -T db mariadb -uroot -p jm_travel < jm_travel.sql
Cek: `SHOW TABLES` di jm_travel berisi tabel (users, programs, bookings, ...).
> MariaDB 10.4 vs MySQL: kalau dump gagal karena versi, kabari errornya.

## Langkah 2 — Jalankan container web
1. Clone repo ini di VPS. Tambahkan service dari `deploy/docker-compose.web.yml` ke
   docker-compose.yml, dan isi WEB_DB_USER/WEB_DB_PASSWORD/WEB_DB_NAME/JWT_SECRET di .env compose.
2. `docker compose up -d --build web`
3. Cek: `docker compose logs -f web` -> "Ready"; `docker compose exec web wget -qO- localhost:3000 | head`

## Langkah 3 — Caddy
Pakai `deploy/Caddyfile.snippet` (tahap 1), lalu `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
Cek SEBELUM ganti DNS:  `curl -I --resolve jmtourtravel.com:443:127.0.0.1 -k https://jmtourtravel.com`
(atau tambahkan `43.156.73.48 jmtourtravel.com` di /etc/hosts laptop, buka di browser).

## Langkah 4 — DNS, lalu matikan GitHub Pages
- `A` record `jmtourtravel.com` dan `www` -> 43.156.73.48; hapus record lama ke `github.io`.
- Repo -> Settings -> Pages -> Unpublish, kosongkan Custom domain. `CNAME` di root repo boleh dihapus.
- Caddy otomatis mengurus SSL setelah DNS mengarah (port 80/443 harus terbuka).

## Nanti (tahap 2)
Satukan DB & JWT_SECRET dengan Go, lalu arahkan endpoint yang sudah di-port ke `api:8080`.
