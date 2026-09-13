-- Snapshot rincian HPP/Margin/Komisi/Jual per lead Kalkulator Estimasi
-- Publik, dihitung SEKALI pas POST /hitung (bukan direcompute belakangan —
-- kalau admin ubah harga master sesudahnya, quote yang UDAH DIKASIH ke
-- jamaah tetap konsisten sama yang beneran ditampilkan). KOLOM TERPISAH dari
-- addon_config biar gampang di-exclude dari SELECT l.* di endpoint admin
-- biasa (super_admin-only, lihat /api/admin/kalkulator-leads/[id]/rincian) —
-- dikonfirmasi user 2026-08-18.
ALTER TABLE kalkulator_lead ADD COLUMN rincian_snapshot JSON NULL AFTER addon_config;
