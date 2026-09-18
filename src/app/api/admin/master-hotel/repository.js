import pool from '@/lib/db';

// Akses data (Model) buat master_hotel + periode-rate anaknya. Query SQL
// HANYA hidup di sini — service.js gak pernah bicara SQL langsung.
class MasterHotelRepository {
  async semua({ kota } = {}) {
    let query = 'SELECT * FROM master_hotel WHERE 1=1';
    const params = [];
    if (kota) { query += ' AND kota = ? AND aktif = 1'; params.push(kota); }
    query += ' ORDER BY kota ASC, bintang ASC, urutan ASC, nama_hotel ASC';
    const [hotels] = await pool.query(query, params);
    return hotels;
  }

  async periodeUntukHotel(hotelIds) {
    if (hotelIds.length === 0) return [];
    const [periode] = await pool.query(
      'SELECT * FROM master_hotel_periode WHERE master_hotel_id IN (?) ORDER BY periode_mulai ASC, urutan ASC',
      [hotelIds]
    );
    return periode;
  }

  async simpan({ kota, bintang, nama_hotel, urutan }) {
    const [result] = await pool.query(
      'INSERT INTO master_hotel (kota, bintang, nama_hotel, urutan) VALUES (?, ?, ?, ?)',
      [kota, Number(bintang), nama_hotel.trim(), Number(urutan) || 0]
    );
    return result.insertId;
  }

  async perbarui(id, { kota, bintang, nama_hotel, urutan, aktif }) {
    const set = [];
    const params = [];
    if (kota != null) { set.push('kota = ?'); params.push(kota); }
    if (bintang != null) { set.push('bintang = ?'); params.push(Number(bintang)); }
    if (nama_hotel != null) { set.push('nama_hotel = ?'); params.push(nama_hotel.trim()); }
    if (urutan != null) { set.push('urutan = ?'); params.push(Number(urutan) || 0); }
    if (aktif != null) { set.push('aktif = ?'); params.push(aktif ? 1 : 0); }
    if (set.length === 0) return { diubah: false };
    params.push(id);
    const [result] = await pool.query(`UPDATE master_hotel SET ${set.join(', ')} WHERE id = ?`, params);
    return { diubah: true, affectedRows: result.affectedRows };
  }

  // Ikut hapus semua periode di bawahnya — gak ada FK constraint di skema
  // ini, jadi dibersihin manual (dijalankan meski hotel-nya sendiri gak
  // ketemu, sama seperti perilaku lama).
  async hapus(id) {
    await pool.query('DELETE FROM master_hotel_periode WHERE master_hotel_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM master_hotel WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

export const masterHotelRepository = new MasterHotelRepository();
