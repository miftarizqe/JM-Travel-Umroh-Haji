// Model — satu-satunya tempat fitur Modul Negara bicara ke API. Controller
// gak pernah manggil fetch() langsung, selalu lewat sini.
export async function ambilModulNegara() {
  const res = await fetch('/api/admin/modul-negara?semua=1&full=1');
  const d = await res.json();
  return d.modul || [];
}

export async function simpanHeaderModulNegara(formModul) {
  const res = await fetch('/api/admin/modul-negara', {
    method: formModul.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formModul),
  });
  const d = await res.json();
  return { res, d };
}

export async function simpanTierModulNegara(modulNegaraId, tiers) {
  const res = await fetch('/api/admin/modul-negara-tier', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modul_negara_id: modulNegaraId, tiers }),
  });
  return res.ok;
}

export async function simpanAddonModulNegara(modulNegaraId, addons) {
  const res = await fetch('/api/admin/modul-negara-addon', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modul_negara_id: modulNegaraId, addons }),
  });
  return res.ok;
}

export async function toggleAktifModulNegara(m) {
  return fetch('/api/admin/modul-negara', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...m, aktif: !m.aktif }),
  });
}

export async function hapusModulNegara(id) {
  const res = await fetch(`/api/admin/modul-negara?id=${id}`, { method: 'DELETE' });
  const d = await res.json();
  return { res, d };
}
