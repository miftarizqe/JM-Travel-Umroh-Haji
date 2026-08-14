# JM TRAVEL — HANDOFF ke Claude Code (12 Juli 2026)

Konteks untuk melanjutkan pekerjaan. Stack: Next.js 16 + MySQL. DB: `jm_travel`, akses `mysql -u root -pJMTravel123! jm_travel`.

## ✅ SUDAH SELESAI HARI INI
1. Migration DB: tabel `programs` +4 kolom (`tanggal_berangkat` DATE, `include_items` TEXT, `exclude_items` TEXT, `itinerary` JSON).
2. API admin programs (`src/app/api/admin/programs/route.js`) — POST/PUT handle 4 kolom baru (itinerary di-JSON.stringify).
3. Form admin (`src/app/admin/programs/page.jsx`) — date picker tanggal berangkat, textarea include/exclude, itinerary dinamis (kolom Hari 1..N mengikuti `durasi`, tiap hari tampil tanggal dihitung dari `tanggal_berangkat`).
4. Halaman detail publik (`src/app/program/[id]/page.jsx`) — 9 harga + include + exclude + itinerary + tombol Booking (wajib login → `/login?redirect=/checkout?prog_id=xxx`).
5. Login (`src/app/login/page.jsx`) — baca `?redirect=`.
6. Landing (`src/app/page.tsx`) — tombol program "Lihat Lebih Detail" → `/program/[id]`; kemitraan agen/perwakilan pakai MODAL + hook; logo → `/`.
7. Logo di `src/app/components/Layout.jsx` → selalu ke `/`.

## 🎯 SEDANG DIKERJAKAN: Formulir jamaah bisa diisi agen/perwakilan/admin + integrasi NIK

### Keputusan desain (SUDAH FINAL):
- Agen/perwakilan/admin bisa isi formulir jamaah, aturan sama seperti jamaah isi sendiri.
- 1 booking = N jamaah → N formulir (mengikuti `jumlah_jamaah`).
- **Order ringkas dulu** (order-jamaah step 2: 8 field), **formulir lengkap (20 field) WAJIB sebelum PELUNASAN dan sebelum SELESAI** (dua-duanya, paling ketat).
- Kalau yang isi agen/perwakilan: field "sumber info / pilih agen" harus AUTO dari akun login + dikunci (bukan dropdown manual). Kalau jamaah sendiri: boleh pilih.

### Temuan kode penting:
- `bookings` punya: `jamaah_data` JSON, `ordered_by`, `ordered_by_role`, `form_filled`, `referral_agen_id`, `referral_perw_id`, `user_id`, status enum(active,selesai,batal,dibatalkan,menunggu_batal), `pelunasan_status` enum(unpaid,pending_confirm,paid).
- `users.nik` varchar(16) UNIQUE. Formulir jamaah menyimpan `nik` per jamaah di `jamaah_data`.
- `POST /api/bookings` (order) SUDAH set `ordered_by`, `referral_agen_id`/`referral_perw_id` otomatis sesuai role login. → komisi akan kepicu benar.
- `PATCH /api/bookings/[id]` simpan `jamaah_data` + `form_filled` — TIDAK mengunci ke pemilik (hanya wajibLogin). Jadi agen sudah bisa menyimpan; masalah hanya di MENEMUKAN booking.
- `GET /api/bookings` HANYA bisa filter `user_id` (wajib). Inilah yang bikin agen tak bisa nemu booking untuk diisi.
- `form-jamaah/page.jsx` fetch `?user_id=parsed.id` lalu `.find(id)` → gagal untuk agen. Prefill baris ~61 isi data user login (salah jika bukan jamaah pemilik).
- Tombol "Isi Formulir" HANYA ada di `dashboard/jamaah` (baris 134). Agen/perwakilan/admin belum punya jalan ke form.
- **INKONSISTENSI FIELD**: order-jamaah step 2 minta 8 field (nama,nik,wa,paspor,alamat,kdnama,kdwa,kdhub); form-jamaah minta ~20 field (tambah: exp paspor mulai/akhir, tempat keluar paspor, tempat/tgl lahir, JK, email, pekerjaan, penyakit, mahram, hub mahram, 3 kontak darurat). Inilah alasan "formulir lengkap wajib sebelum pelunasan/selesai".

### TODO (4 bagian):
1. **API GET by booking_id** — `src/app/api/bookings/route.js`: dukung `?booking_id=xxx`, kontrol akses (boleh jika `user_id===uid` ATAU `ordered_by===uid` ATAU role admin), else 403.
2. **UI form-jamaah** (`src/app/form-jamaah/page.jsx`) — 5 titik: (a) fetch pakai `?booking_id=` ambil `[0]`; (b) prefill hanya jika `found.user_id===parsed.id && role==='jamaah'`, else kosong; muat `jamaah_data` lama jika ada; (c) resolusi referral: jika role agen/perwakilan → auto dari user login, kunci dropdown sumber; (d) redirect akhir sesuai role (admin→/admin, agen→/dashboard/agen, perwakilan→/dashboard/perwakilan, jamaah→/dashboard/jamaah); (e) render dropdown sumber_info dikunci untuk agen/perwakilan.
3. **Tombol "Lengkapi Formulir"** di `dashboard/agen`, `dashboard/perwakilan` (+ admin) untuk booking yang mereka order, penanda `form_filled` kosong = belum lengkap.
4. **Gerbang `form_filled`**: tolak PELUNASAN (`/api/payments` atau route pelunasan) & tolak SELESAI (`/api/admin/booking-selesai/route.js`) jika `form_filled` kosong/0 atau `form_filled < jumlah_jamaah`.

## ⏭️ SETELAH ITU: TES BOOKING END-TO-END (komisi_ledger)
`komisi_ledger` masih 0 baris. Penyebab: belum pernah ada booking yang (a) dibawa agen (referral_agen_id keisi) DAN (b) status='selesai'. Booking lama (2) semua `referral_agen_id`=NULL & status=active → tak berguna untuk tes komisi.
- Struktur agen tes sudah disiapkan berjenjang: Agen Tes → perekrut Perwakilan Tes → perekrut ALBERT(is_leader=1).
  - Agen Tes id: 11955f72-775e-11f1-851e-845934f7393a
  - Perwakilan Tes id: 11a02dda-775e-11f1-851e-845934f7393a
  - ALBERT id: e51560ba-7b99-11f1-9925-d7fa60f19928 (leader)
- Program tes: "Special Tahun Baru 1448H" id d1fb77e2-762d-11f1-adb4-30f025e81cd0. CEK dulu kolom komisi_deluxe/bsi/leader/override & kategori=group_resmi (kalau 0/bukan group_resmi, komisi tak terbentuk).
- Logika komisi ada di `src/app/api/admin/booking-selesai/route.js` (lengkap: closing_pribadi, closing_bsi, points, override L1-3, leader, override leader berjenjang, auto-promosi leader di 30 jamaah/tahun). Hanya jalan jika `kategori==='group_resmi'` && `referral_agen_id` ada.
- Rencana tes: login Agen Tes → order 1 jamaah deluxe → DP confirm → isi form lengkap → pelunasan → admin tandai selesai → cek `SELECT * FROM komisi_ledger`.

## Aturan penamaan file progress: DDMMYY, contoh PROGRESS-JM-TRAVEL-120726.md
