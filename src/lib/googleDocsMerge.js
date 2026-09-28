// Mail-merge generic via Google Docs + Drive API — duplikat 1 Google Doc
// template, ganti semua {{token}} jadi data asli, export jadi PDF. Dipakai
// pertama kali buat percobaan SK-CIF (src/app/api/sahabat/sk-cif/pdf-percobaan/
// route.js) — sengaja generic (bukan sk-cif-specific) biar gampang dipakai
// ulang buat dokumen lain kalau percobaan ini lanjut ke produksi.
//
// Beda dari src/lib/pasalGoogleSheet.js (baca-doang, scope
// spreadsheets.readonly): di sini scope-nya documents+drive (baca DAN nulis)
// karena kita bikin file baru (copy) & hapus lagi setelah export — pakai
// service account YANG SAMA (GOOGLE_SERVICE_ACCOUNT_EMAIL/_PRIVATE_KEY).
//
// Template Doc & folder tujuan copy WAJIB ada di Google Workspace SHARED
// DRIVE (bukan "My Drive" personal) — service account gak punya kuota
// penyimpanan sendiri, cuma Shared Drive yang kuotanya nempel ke organisasi.
// Makanya semua panggilan Drive API di bawah pakai `supportsAllDrives: true`.
import { google } from 'googleapis';

function ambilClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !privateKey) {
    throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY belum diisi di env.'), { status: 400 });
  }
  const auth = new google.auth.JWT(email, null, privateKey, [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
  ]);
  return {
    docs: google.docs({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

/**
 * @param {{templateDocId:string, driveFolderId:string, mergeData:Record<string,string|number|null|undefined>, namaFile:string}} opts
 * @returns {Promise<Buffer>} PDF hasil merge
 */
export async function mergeTemplateKePdf({ templateDocId, driveFolderId, mergeData, namaFile }) {
  if (!templateDocId || !driveFolderId) {
    throw Object.assign(new Error('templateDocId/driveFolderId belum diisi (cek env SK_CIF_TEMPLATE_DOC_ID & GOOGLE_DRIVE_FOLDER_ID).'), { status: 400 });
  }
  const { docs, drive } = ambilClient();

  const copy = await drive.files.copy({
    fileId: templateDocId,
    supportsAllDrives: true,
    requestBody: { name: namaFile, parents: [driveFolderId] },
  });
  const copyId = copy.data.id;

  try {
    const requests = Object.entries(mergeData).map(([key, value]) => ({
      replaceAllText: {
        containsText: { text: `{{${key}}}`, matchCase: true },
        replaceText: value === null || value === undefined || value === '' ? '-' : String(value),
      },
    }));
    if (requests.length) {
      await docs.documents.batchUpdate({ documentId: copyId, requestBody: { requests } });
    }

    const pdfRes = await drive.files.export(
      { fileId: copyId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(pdfRes.data);
  } finally {
    // Copy sementara udah gak perlu lagi begitu PDF-nya di tangan — dihapus
    // biar Shared Drive gak numpuk file percobaan. Dibungkus try/catch
    // sendiri (bukan bagian try utama) biar gagal-hapus gak nge-gagalin
    // permintaan yang PDF-nya udah kelar diambil.
    await drive.files.delete({ fileId: copyId, supportsAllDrives: true }).catch(() => {});
  }
}
