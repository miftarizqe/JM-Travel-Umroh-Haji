export async function ambilMasterItem() {
  const res = await fetch('/api/admin/biaya-master-item?semua=1');
  const d = await res.json();
  return d.item || [];
}

export async function simpanMasterItem(formMaster) {
  const res = await fetch('/api/admin/biaya-master-item', {
    method: formMaster.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formMaster),
  });
  const d = await res.json();
  return { res, d };
}

export async function toggleAktifMasterItem(m) {
  return fetch('/api/admin/biaya-master-item', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...m, aktif: !m.aktif }),
  });
}

// paksa=1 dipanggil ulang setelah admin konfirmasi lewat reminder (respons
// 409 confirm_required dari DELETE pertama, lihat controller.jsx).
export async function hapusMasterItem(id, { paksa = false } = {}) {
  const qs = new URLSearchParams({ id: String(id), ...(paksa ? { paksa: '1' } : {}) });
  const res = await fetch(`/api/admin/biaya-master-item?${qs}`, { method: 'DELETE' });
  const d = await res.json();
  return { res, d };
}
