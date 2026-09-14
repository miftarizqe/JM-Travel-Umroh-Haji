export async function ambilPengaturanKurs() {
  const res = await fetch('/api/admin/pengaturan');
  const d = await res.json();
  return { kurs_sar_idr: d.pengaturan?.kurs_sar_idr ?? '', kurs_usd_idr: d.pengaturan?.kurs_usd_idr ?? '' };
}

export async function simpanPengaturanKurs(formKurs) {
  const res = await fetch('/api/admin/pengaturan', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formKurs),
  });
  const d = await res.json();
  return { res, d };
}
