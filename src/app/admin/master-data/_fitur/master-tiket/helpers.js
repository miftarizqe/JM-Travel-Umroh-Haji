export const RUTE_LABEL = { direct: 'Direct', transit: 'Transit' };

export function kosongTiket() {
  return { nama_rute: '', kota_asal: '', kota_tujuan: '', rute: '', negara_transit_id: '', periode_mulai: '', periode_selesai: '', berlaku_sampai: '', rate: '', mata_uang: 'IDR' };
}
