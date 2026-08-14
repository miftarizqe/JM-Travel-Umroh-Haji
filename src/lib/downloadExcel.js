// Fetch file xlsx dari /api/admin/export dan langsung trigger download di
// browser. Lempar Error kalau gagal — pemanggil yang atur state loading/alert.
export async function downloadExcel(type, params = {}) {
  const qs = new URLSearchParams({ type });
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const res = await fetch(`/api/admin/export?${qs.toString()}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Gagal export data');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jm-travel-${type}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
