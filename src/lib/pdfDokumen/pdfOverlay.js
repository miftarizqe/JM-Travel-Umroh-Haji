// Helper bersama buat nempel teks di atas template PDF final — dipakai
// skCifOverlay.js & suratPemblokiranOverlay.js. Koordinat field per dokumen diukur
// presisi pakai `pdftotext -bbox nama-template.pdf` (poppler-utils):
// yMin/yMax hasil situ diukur dari ATAS halaman, dikonversi ke koordinat
// pdf-lib (dari BAWAH, dipakai drawText) via `pageHeight - yMax + 2`.
import { rgb } from 'pdf-lib';
import { readFile } from 'fs/promises';

export async function embedTemplatePages(outDoc, templatePath, pageIndices) {
  const bytes = await readFile(templatePath);
  return outDoc.embedPdf(bytes, pageIndices);
}

export function tempelHalamanTemplate(outDoc, embedded) {
  const page = outDoc.addPage([embedded.width, embedded.height]);
  page.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  return page;
}

// Timpa area blank ("______"/"( )") pakai kotak putih SEBELUM nulis teks —
// tanpa ini, sisa garis bawah template yang lebih panjang dari nilai yang
// diisi bakal tetep keliatan nyembul di belakang teksnya.
// Tinggi box SENGAJA gak simetris (bawah lebih dalam dari atas) — garis
// bawah "______" placeholder nangkring agak di bawah baseline (mirip
// descender p/g), sementara box gak perlu setinggi ascender teks baru
// (teks baru digambar DI ATAS box ini, jadi kebaca gak peduli tinggi
// box). Kalau box kegedean & jarak antar baris di template sempit (~14pt
// buat font 11), box baris bawah bisa nutupin ekor descender baris DI
// ATASnya — bug nyata dari screenshot user 2026-09-29 (huruf "p" kepotong).
function tutupBlank(page, { left, y, width, size, atasExtra = 0 }) {
  const bawah = 5;
  const atas = size * 0.75 + atasExtra;
  page.drawRectangle({ x: left, y: y - bawah, width, height: atas + bawah, color: rgb(1, 1, 1) });
}

// Rata kiri, mulai dari titik x — dipakai buat isian "Label : ______".
// `indent` (opsional) — geser TITIK MULAI TEKS ke kanan tanpa geser kotak
// penutup blank (yang tetap mulai dari `x`, biar seluruh sisa "______"
// template tetap ketutup) — dipakai buat isian di TENGAH kalimat (bukan
// "Label : ______") yang nempel langsung ke kata sebelumnya kalau teksnya
// mulai persis di awal blank, mis. "waktu90" / "tanggal29 September 2026"
// (bug nyata dari screenshot user 2026-09-29, keliatan gak ada spasi).
// `atasExtra` (opsional) — nambah tinggi kotak penutup ke ATAS, buat field
// yang placeholder templatenya BUKAN garis bawah kosong tapi teks contoh
// beneran dicetak (mis. "Nomor: 0000xx.09/JMT-XXX/2026") -- tingginya
// (~12-13pt) lebih tinggi dari formula size*0.75 yang dituning buat garis
// blank biasa, jadi nongol ngintip di atas kotak kalau gak ditambah (bug
// nyata ketemu di field nomor SPK-AK/SPK-AK Non-Muslim/SPKA-Ins 2026-10-18).
export function drawFitKiri(page, font, text, { x, y, maxWidth, indent = 0, atasExtra = 0 }, size) {
  if (!text) return;
  let fontSize = size;
  const availableWidth = maxWidth - indent;
  const width = font.widthOfTextAtSize(text, fontSize);
  if (width > availableWidth) fontSize *= availableWidth / width;
  tutupBlank(page, { left: x, y, width: maxWidth, size, atasExtra });
  page.drawText(text, { x: x + indent, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}

// Bungkus teks jadi beberapa baris berdasarkan LEBAR ASLI (greedy word-wrap)
// — font size TETAP di tiap baris (gak ikut-ikutan di-shrink drawFitKiri
// kalau baris itu sendiri muat), beda dari pola lama "split 2 baris tetap
// per kelompok komponen alamat" yang baris-nya sering gak seimbang: baris
// pendek nyisain spasi nganggur, baris panjang malah numpuk & ujung-ujungnya
// di-shrink drawFitKiri walau baris satunya lega (dikonfirmasi user
// 2026-10-09, dari field Alamat di SK-CIF/Surat Pemblokiran/SPK-AK/Formulir
// BSI). Baris TERAKHIR aja yang boleh kepanjangan (sisa kata dipaksa masuk
// apa adanya) kalau kehabisan slot `maxLines` -- drawFitKiri yang nanti
// nge-shrink KHUSUS baris itu sebagai fallback ekstrem, harusnya jarang
// kejadian selama alamatnya wajar.
export function wrapTextLines(text, font, fontSize, maxWidth, maxLines) {
  if (!text) return [];
  const kata = text.split(' ').filter(Boolean);
  const baris = [];
  let current = '';
  let i = 0;
  while (i < kata.length) {
    const w = kata[i];
    const cand = current ? `${current} ${w}` : w;
    const muat = font.widthOfTextAtSize(cand, fontSize) <= maxWidth;
    if (muat || !current) {
      current = cand;
      i++;
    } else if (baris.length < maxLines - 1) {
      baris.push(current);
      current = '';
    } else {
      // Baris TERAKHIR yang boleh kepanjangan — BUG ditemukan & diperbaiki
      // 2026-10-21: versi lama nimpa `current` cuma dengan `kata.slice(i)`,
      // BUANG semua kata yang udah kebukti MUAT dan nempel di `current` dari
      // iterasi sebelumnya (overflow KEDUA di baris terakhir ini bikin
      // sebagian alamat ilang total dari PDF, bukan cuma kekecilan/kepotong
      // — ketemu pas alamat panjang di dokumen Agen). `current` WAJIB
      // digabung duluan, bukan ditimpa.
      current = (current ? `${current} ` : '') + kata.slice(i).join(' ');
      break;
    }
  }
  if (current) baris.push(current);
  return baris;
}

// Gambar teks panjang (alamat dkk) direflow ke N baris (wrapTextLines) lalu
// digambar turun `lineHeight` per baris dari slot baris PERTAMA -- slot
// baris ke-2/3/dst DIHITUNG otomatis (bukan dikasih koordinat manual
// terpisah), karena jaraknya emang konsisten tiap baris di template yang
// sama (diukur pdftotext -bbox).
export function drawAlamatWrap(page, font, text, { x, y, maxWidth, indent = 0 }, size, maxLines, lineHeight) {
  const baris = wrapTextLines(text, font, size, maxWidth - indent, maxLines);
  baris.forEach((line, i) => {
    drawFitKiri(page, font, line, { x, y: y - i * lineHeight, maxWidth, indent }, size);
  });
}

// Rata tengah dalam sebuah box — dipakai buat nama tercetak di kolom TTD
// "( nama )" biar simetris di antara kurung buka & tutup.
export function drawFitCenter(page, font, text, { center, y, maxWidth }, size) {
  if (!text) return;
  let fontSize = size;
  let width = font.widthOfTextAtSize(text, fontSize);
  if (width > maxWidth) { fontSize *= maxWidth / width; width = maxWidth; }
  tutupBlank(page, { left: center - maxWidth / 2, y, width: maxWidth, size });
  page.drawText(text, { x: center - width / 2, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
}
