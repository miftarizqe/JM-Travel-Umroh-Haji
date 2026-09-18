export async function ambilTiket() {
  const res = await fetch('/api/admin/master-tiket-rate');
  const d = await res.json();
  return d.rate || [];
}

export async function simpanTiket(payload, editId) {
  const res = await fetch('/api/admin/master-tiket-rate', {
    method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editId ? { ...payload, id: editId } : payload),
  });
  const d = await res.json();
  return { res, d };
}

export async function toggleAktifTiket(item) {
  return fetch('/api/admin/master-tiket-rate', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: item.id, aktif: !item.aktif }),
  });
}

export async function hapusTiket(id) {
  const res = await fetch(`/api/admin/master-tiket-rate?id=${id}`, { method: 'DELETE' });
  const d = await res.json();
  return { res, d };
}
