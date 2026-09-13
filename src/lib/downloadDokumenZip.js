// Fetch ZIP semua dokumen 1 program dari /api/admin/export-dokumen dan
// langsung trigger download di browser. Pola sama persis downloadExcel.js,
// cuma tipe filenya beda.
export async function downloadDokumenZip(progId) {
  const res = await fetch(`/api/admin/export-dokumen?prog_id=${encodeURIComponent(progId)}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Gagal export dokumen');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jm-travel-dokumen-${progId}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
