export async function ambilHotel() {
  const res = await fetch('/api/admin/master-hotel');
  const d = await res.json();
  return d.hotel || [];
}

export async function simpanHotel(formHotel, editHotelId) {
  const res = await fetch('/api/admin/master-hotel', {
    method: editHotelId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editHotelId ? { ...formHotel, id: editHotelId } : formHotel),
  });
  const d = await res.json();
  return { res, d };
}

export async function simpanPeriodeAwal(hotelId, periode) {
  const res = await fetch('/api/admin/master-hotel-periode', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...periode, master_hotel_id: hotelId }),
  });
  const d = await res.json();
  return { ok: res.ok, d };
}

export async function toggleAktifHotel(h) {
  return fetch('/api/admin/master-hotel', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: h.id, aktif: !h.aktif }),
  });
}

export async function hapusHotel(id) {
  const res = await fetch(`/api/admin/master-hotel?id=${id}`, { method: 'DELETE' });
  const d = await res.json();
  return { res, d };
}

export async function simpanPeriode(hotelId, formPeriode, editPeriodeId) {
  const payload = { ...formPeriode, master_hotel_id: hotelId };
  const res = await fetch('/api/admin/master-hotel-periode', {
    method: editPeriodeId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editPeriodeId ? { ...payload, id: editPeriodeId } : payload),
  });
  const d = await res.json();
  return { res, d };
}

export async function hapusPeriode(id) {
  const res = await fetch(`/api/admin/master-hotel-periode?id=${id}`, { method: 'DELETE' });
  const d = await res.json();
  return { res, d };
}
