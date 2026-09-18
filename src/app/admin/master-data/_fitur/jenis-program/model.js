export async function ambilJenisProgram() {
  const res = await fetch('/api/admin/jenis-program?semua=1');
  const d = await res.json();
  return d.jenis_program || [];
}

export async function simpanJenisProgram(formJenisProgram) {
  const res = await fetch('/api/admin/jenis-program', {
    method: formJenisProgram.value ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formJenisProgram),
  });
  const d = await res.json();
  return { res, d };
}

export async function toggleAktifJenisProgram(j) {
  return fetch('/api/admin/jenis-program', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...j, aktif: !j.aktif }),
  });
}

export async function hapusJenisProgram(value) {
  const res = await fetch(`/api/admin/jenis-program?value=${value}`, { method: 'DELETE' });
  const d = await res.json();
  return { res, d };
}
