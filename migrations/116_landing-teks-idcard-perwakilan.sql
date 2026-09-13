USE jm_travel;

-- Parity fix (user, 2026-08-03): ID Card bukan cuma fasilitas Agen, Perwakilan
-- juga dapat. Lihat migration-landing-teks-idcard-agen.sql buat sisi Agen.
UPDATE landing_page_teks
  SET nilai = 'Tentukan harga sendiri\nUjroh = selisih HPP\nBranding resmi\nDashboard closing\nID Card resmi Perwakilan JM Travel'
  WHERE kunci = 'kemitraan_perwakilan_items';

UPDATE landing_page_teks
  SET nilai = 'Tentukan harga jual sendiri\nUjroh = selisih dari HPP\nBranding resmi di bawah JM Travel\nDashboard closing & laporan sendiri\nDifasilitasi ID Card resmi Perwakilan JM Travel'
  WHERE kunci = 'kemitraan_modal_perwakilan_benefit';
