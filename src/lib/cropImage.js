// Util rotate & crop gambar berbasis Canvas API — dipasangkan dengan
// react-easy-crop di UploadBon.jsx. Rotate & crop SENGAJA dipisah jadi 2
// langkah: rotate dibakar duluan ke gambar baru (ukuran penuh, gak ada yang
// kepotong), baru HASIL rotate itu yang (opsional) di-crop pakai aspect yang
// sesuai ukuran aslinya sendiri (biar zoom=1 nunjukin foto utuh, bukan
// keukur ke rasio yang gak nyambung sama fotonya).

function keRadian(derajat) {
  return (derajat * Math.PI) / 180;
}

function muatGambar(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = src;
  });
}

function canvasKeBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses gambar'))), 'image/jpeg', 0.92);
  });
}

/**
 * Bakar rotasi ke gambar baru (gak ada crop, ukuran canvas menyesuaikan biar
 * gak ada sudut kepotong pas rotasi 90/270).
 * @returns {Promise<{blob:Blob, url:string, width:number, height:number}>}
 */
export async function rotateImage(imageSrc, rotation = 0) {
  const image = await muatGambar(imageSrc);
  if (!rotation) {
    // Gak ada rotasi — gak perlu re-encode, langsung pakai ukuran asli.
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await canvasKeBlob(canvas);
    return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const radian = keRadian(rotation);
  const sin = Math.abs(Math.sin(radian));
  const cos = Math.abs(Math.cos(radian));
  canvas.width = image.width * cos + image.height * sin;
  canvas.height = image.height * cos + image.width * sin;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radian);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const blob = await canvasKeBlob(canvas);
  return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}

/**
 * Potong gambar (yang rotasinya SUDAH dibakar duluan lewat rotateImage, jadi
 * di sini gak perlu urus rotasi lagi) sesuai area dari onCropComplete
 * react-easy-crop.
 * @param {{x:number,y:number,width:number,height:number}} pixelCrop
 * @returns {Promise<Blob>}
 */
export async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await muatGambar(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  canvas.getContext('2d').drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return canvasKeBlob(canvas);
}
