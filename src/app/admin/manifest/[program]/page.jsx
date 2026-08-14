'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/app/components/Layout';
import TombolWA from '@/app/components/TombolWA';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { pesanVerifikasiManifest } from '@/lib/waTemplates';

const tgl = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const tglJudul = (t) => t ? new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase() : '-';
const jkSingkat = (jk) => jk === 'Laki-Laki' ? 'M' : jk === 'Perempuan' ? 'F' : (jk || '-');
const DOC_FIELDS = [
  ['doc_paspor', 'Scan Paspor'], ['doc_kk', 'Kartu Keluarga'], ['doc_ktp', 'KTP'],
  ['doc_vaksin', 'Bukti Vaksin'], ['doc_foto', 'Pas Foto'],
];

export default function ManifestPage() {
  const router = useRouter();
  const params = useParams();
  const programName = params?.program ? decodeURIComponent(params.program) : '';

  const [user] = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [detailFor, setDetailFor] = useState(null);

  useEffect(() => {
    // Sama seperti halaman admin lain — user null di render pertama krn
    // localStorage belum kebaca, BUKAN belum login (middleware sudah jamin).
    if (!user) return;
    if (!['admin','super_admin'].includes(user.role)) { router.replace('/login'); return; }
    if (!programName) return;
    fetch(`/api/admin/manifest?program=${encodeURIComponent(programName)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, programName]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/manifest/export?program=${encodeURIComponent(programName)}`);
      if (!res.ok) { alert('Gagal membuat file manifest'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manifest-${programName.replace(/[^a-zA-Z0-9]+/g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Terjadi kesalahan saat download');
    } finally {
      setDownloading(false);
    }
  }

  if (!user || loading || !data) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  const { program, rows } = data;

  return (
    <Layout title="🕌 Manifest Jamaah" backHref="/admin/database/program">
      <div className="bg-white border border-gray-300 rounded-xl p-5 mb-4 text-center">
        <div className="font-bold text-lg text-[#0E2F6E]">MANIFEST UMROH TGL {tglJudul(program.tanggal_berangkat)}</div>
        <div className="font-bold text-lg text-[#0E2F6E]">PT. ALKHALID JAYA MEGAH</div>
        <div className="text-xs text-gray-400 mt-1">{program.name}{program.kategori ? ` · ${program.kategori}` : ''}</div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-400">{rows.length} jamaah (tidak termasuk yang cancel program)</div>
        <button onClick={handleDownload} disabled={downloading}
          className="bg-[#1A4FA0] hover:bg-[#0E2F6E] disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl whitespace-nowrap">
          {downloading ? 'Menyiapkan...' : '⬇️ Download Excel'}
        </button>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-auto max-h-[75vh]">
        <table className="border-collapse text-sm min-w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#0E2F6E] text-white text-xs">
              <th className="border border-[#0E2F6E] px-3 py-2 text-left w-10">NO</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">FULL NAME</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">GENDER</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">PLACE OF BIRTH</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">DATE OF BIRTH</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">PASPOR NUMBER</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">DATE OF ISSUED</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">DATE OF EXPIRED</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">CITY OF ISSUED</th>
              <th className="border border-[#0E2F6E] px-3 py-2 text-left">MAHRAM</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="border border-gray-200 px-4 py-8 text-center text-gray-400">Belum ada jamaah terdaftar di program ini.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-200 px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">
                  <button onClick={() => setDetailFor(r)} className="text-[#1A4FA0] font-bold hover:underline whitespace-nowrap">
                    {r.nama}
                  </button>
                </td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{jkSingkat(r.jk)}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{r.tl}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{tgl(r.ttl)}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">
                  {r.doc_paspor ? (
                    <a href={r.doc_paspor} target="_blank" rel="noopener noreferrer"
                      title="Lihat/download scan paspor"
                      className="text-[#1A4FA0] font-bold hover:underline">
                      {r.paspor} 📄
                    </a>
                  ) : r.paspor}
                </td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{tgl(r.exp_mulai)}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{tgl(r.exp_paspor)}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{r.tkp}</td>
                <td className="border border-gray-200 px-3 py-2 whitespace-nowrap">{r.mahram}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail formulir per-jamaah — data APA ADANYA dari booking program ini
          (beda dari Database Jamaah yang nunjukin data booking TERBARU orang
          itu di program manapun) — biar sesuai sama manifest keberangkatan ini. */}
      {detailFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailFor(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[#0E2F6E]">📋 Detail Formulir — {detailFor.nama}</h3>
              <button onClick={() => setDetailFor(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {detailFor.wa && detailFor.wa !== '-' && (
              <TombolWA nomor={detailFor.wa}
                label="Kirim WA ke Jamaah"
                className="w-full mb-3 inline-flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-full"
                pesan={pesanVerifikasiManifest({ namaJamaah: detailFor.nama, progName: programName })}
              />
            )}
            {(() => {
              const Field = ({ label, value }) => (
                <div className="flex justify-between gap-3 py-1.5 border-b border-gray-100 text-sm">
                  <span className="text-gray-400 shrink-0">{label}</span>
                  <span className="font-semibold text-right">{value || '-'}</span>
                </div>
              );
              return (
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase mb-1">Data Pribadi</div>
                  <Field label="Nama Sesuai Paspor" value={detailFor.nama} />
                  <Field label="No. Paspor" value={detailFor.paspor} />
                  <Field label="Masa Berlaku Paspor" value={detailFor.exp_mulai || detailFor.exp_paspor ? `${tgl(detailFor.exp_mulai)} s/d ${tgl(detailFor.exp_paspor)}` : ''} />
                  <Field label="Tempat Keluar Paspor" value={detailFor.tkp} />
                  <Field label="Tempat, Tanggal Lahir" value={detailFor.tl || detailFor.ttl ? `${detailFor.tl && detailFor.tl !== '-' ? detailFor.tl : ''}${detailFor.tl && detailFor.tl !== '-' && detailFor.ttl ? ', ' : ''}${detailFor.ttl ? tgl(detailFor.ttl) : ''}` : ''} />
                  <Field label="NIK" value={detailFor.nik} />
                  <Field label="Jenis Kelamin" value={detailFor.jk} />
                  <Field label="Alamat" value={detailFor.alamat} />
                  <Field label="WhatsApp" value={detailFor.wa} />
                  <Field label="Email" value={detailFor.email} />
                  <Field label="Riwayat Penyakit" value={detailFor.penyakit} />
                  <Field label="Pekerjaan" value={detailFor.pkj} />

                  <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Mahram / Pendamping</div>
                  <Field label="Nama Mahram" value={detailFor.mahram} />
                  <Field label="Hubungan dengan Jamaah" value={detailFor.hub_mahram} />

                  <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Kontak Darurat</div>
                  <Field label="Nama" value={detailFor.kdnama} />
                  <Field label="WhatsApp" value={detailFor.kdwa} />
                  <Field label="Hubungan" value={detailFor.kdhub} />

                  {DOC_FIELDS.some(([k]) => detailFor[k]) && (
                    <>
                      <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Dokumen Pendukung</div>
                      {DOC_FIELDS.filter(([k]) => detailFor[k]).map(([k, label]) => (
                        <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-gray-100 text-sm">
                          <span className="text-gray-400 shrink-0">{label}</span>
                          <a href={detailFor[k]} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1A4FA0] hover:underline">📄 Lihat</a>
                        </div>
                      ))}
                    </>
                  )}

                  <div className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Info Booking</div>
                  <Field label="Status" value={detailFor.status_jamaah} />
                  <Field label="Dipesankan Oleh" value={detailFor.pemesan_nama} />
                  <Field label="Booking ID" value={detailFor.booking_id} />

                  {detailFor.nama === '(formulir belum diisi)' ? (
                    <div className="text-xs text-gray-400 text-center mt-4">Formulir belum diisi untuk jamaah ini.</div>
                  ) : (
                    <button onClick={() => window.open(`/admin/cetak-formulir/${detailFor.booking_id}?idx=${detailFor.idx}`, '_blank')}
                      className="w-full mt-5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold py-2 rounded-full">
                      🖨️ Cetak / Download Formulir
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </Layout>
  );
}
