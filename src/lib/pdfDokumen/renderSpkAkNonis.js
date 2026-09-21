// Generate PDF Surat Perjanjian Referral Non-Muslim — Program Sahabat
// Baitullah. Mirror PERSIS renderSpkAk.js (3 pihak, 2 rangkap + materai
// silang, RANGKAP_SPK_AK_NONIS di materaiRule.js) — dokumen TERPISAH
// (dikonfirmasi user 2026-09-20) buat anggota non-Muslim yang gak
// berangkat sendiri, tapi memberangkatkan orang lain pakai akun/tabungan
// sendiri. Redaksi pasal lengkap tetap admin-editable lewat /admin/pasal
// (dokumen key 'spk_ak_nonis'), bukan hardcode di sini.
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { styles, Kop, Field, SPASI_SEBELUM_PASAL_PDF, UKURAN_PDF } from './pdfStyles';
import { renderPasalMarkupPdf } from '@/lib/pasalMarkupPdf';
import { tambahNomorHalaman } from './nomorHalaman';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglIndo = (d) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {object|null} opts.hop - Head of Program (pengaturan.head_of_program_user_id)
 * @param {string} opts.nomor
 * @param {Array<{nomor:number, judul:string, isi:string}>} opts.pasal
 * @param {{nama:string, jabatan:string}} [opts.signer] - penandatangan Management JM Travel
 * @param {object} opts.pengaturan
 * @param {string} opts.logoPath
 * @param {boolean} [opts.untukTtdDigital]
 * @param {string} [opts.rangkapLabel] - "Rangkap 1 — Untuk JM Travel" dst (lihat RANGKAP_SPK_AK_NONIS)
 * @param {{target_minat:string, target_estimasi_harga:number}|null} [opts.target] - target paket/harga isian jamaah (sahabat_pendaftaran)
 */
export async function renderSpkAkNonisPdf({ user, hop, nomor, pasal, signer, pengaturan, logoPath, untukTtdDigital, rangkapLabel, target }) {
  const namaPenandatangan = signer?.nama || 'Ahmad Zaky Arief Bestary';
  const jabatanPenandatangan = signer?.jabatan || 'Direktur Pengembangan Bisnis & Sumber Daya Manusia';
  const hopEfektif = hop || {
    name: namaPenandatangan, nik: '-', alamat: '(mewakili PT. Alkhalid Jaya Megah)', wa: '-',
  };
  const tglGabung = new Date(user.created_at || Date.now());
  const mergeData = {
    bank_agen: user.bank, rekening_agen: user.no_rekening, nama_rekening_agen: user.nama_pemilik_rekening,
    target_minat: target?.target_minat || '(belum ditentukan)',
    target_estimasi_harga: target?.target_estimasi_harga ? Number(target.target_estimasi_harga).toLocaleString('id-ID') : '________',
  };

  const TtdBox = ({ pihak, sub, nama, solo }) => (
    <View style={solo ? [styles.ttdBox, styles.ttdBoxSolo] : styles.ttdBox}>
      <Text>{pihak}</Text>
      <Text style={{ fontFamily: 'Times-Bold' }}>{sub}</Text>
      <View style={styles.ttdSpace}>
        {untukTtdDigital && <Text style={{ fontSize: 6, color: '#999' }}>(menunggu TTD digital)</Text>}
      </View>
      <Text style={styles.ttdLine}>({nama})</Text>
    </View>
  );

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View fixed><Kop pengaturan={pengaturan} logoPath={logoPath} /></View>
        {rangkapLabel && (
          <Text style={{ textAlign: 'right', fontSize: 6.75, fontFamily: 'Times-Bold', color: '#C9952A', marginBottom: 3 }}>{rangkapLabel}</Text>
        )}
        <Text style={styles.judul}>SURAT PERJANJIAN REFERRAL NON-MUSLIM</Text>
        <Text style={styles.judul}>PROGRAM SAHABAT BAITULLAH</Text>
        <Text style={styles.subJudul}>Nomor: {nomor || '-'}</Text>

        <Text style={{ fontSize: UKURAN_PDF.normal, marginBottom: 4.5 }}>
          Pada hari {HARI[tglGabung.getDay()]}, tanggal {tglIndo(tglGabung)}, bertempat di Jakarta, kami yang bertanda tangan dibawah ini :
        </Text>

        <Text style={styles.sectionTitle}>Pihak Pertama (Penyelenggara Umroh &amp; Haji)</Text>
        <Field label="Nama Perusahaan" value="PT. Alkhalid Jaya Megah" />
        <Field label="No. Izin PPIU/PIHK" value="SK PPIU No.921 Tahun 2017 / SK PHIK No.35 Tahun 2019" />
        <Field label="Diwakilkan oleh" value={namaPenandatangan} />
        <Field label="Jabatan" value={jabatanPenandatangan} />

        <Text style={styles.sectionTitle}>Pihak Kedua (Anggota Sahabat Baitullah)</Text>
        <Field label="Nama" value={user.name} />
        <Field label="NIK" value={user.nik} />
        <Field label="Alamat" value={user.alamat} />
        <Field label="No. Telepon" value={user.wa} />
        <Field label="No. Paspor" value={user.no_paspor} />

        <Text style={styles.sectionTitle}>Pihak Ketiga (Head of Program)</Text>
        <Field label="Nama" value={hopEfektif.name} />
        <Field label="NIK" value={hopEfektif.nik} />
        <Field label="Alamat" value={hopEfektif.alamat} />
        <Field label="No. Telepon" value={hopEfektif.wa} />

        <Text style={{ fontSize: UKURAN_PDF.normal, marginTop: 6 }}>
          PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian Referral Program Sahabat Baitullah dengan ketentuan sebagai berikut:
        </Text>

        {(pasal || []).map(p => (
          <View key={p.nomor} style={{ marginTop: SPASI_SEBELUM_PASAL_PDF }}>
            <View wrap={false}>
              <Text style={{ textAlign: 'center', fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul }}>PASAL {p.nomor}</Text>
              <Text style={{ textAlign: 'center', fontFamily: 'Times-Bold', fontSize: UKURAN_PDF.subJudul, marginBottom: 3 }}>{p.judul}</Text>
            </View>
            {renderPasalMarkupPdf(p.isi, mergeData)}
          </View>
        ))}

        <View style={styles.ttdRow}>
          <TtdBox pihak="PIHAK PERTAMA" sub="PT. Alkhalid Jaya Megah" nama={namaPenandatangan} />
          <TtdBox pihak="PIHAK KEDUA" sub="Anggota Sahabat Baitullah" nama={user.name} />
        </View>
        <View style={styles.ttdSolo}>
          <TtdBox pihak="PIHAK KETIGA" sub="Head of Program" nama={hopEfektif.name} solo />
        </View>

      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return tambahNomorHalaman(buffer);
}
