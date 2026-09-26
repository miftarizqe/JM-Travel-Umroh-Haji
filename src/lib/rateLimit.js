// Rate limit sederhana di memori proses. Cukup karena Next.js jalan sebagai
// SATU instance (lihat Dockerfile); kalau nanti di-scale, pindah ke Redis/DB.
// Pola jendela tetap per kunci: `batas` percobaan per `jendelaMs`.

const semuaLimiter = [];

export function buatLimiter(batas, jendelaMs) {
  const data = new Map(); // kunci -> { jumlah, resetPada }
  const limiter = {
    /** Catat 1 percobaan. Balikin { boleh, sisaDetik }. */
    cek(kunci) {
      const now = Date.now();
      let e = data.get(kunci);
      if (!e || e.resetPada <= now) {
        e = { jumlah: 0, resetPada: now + jendelaMs };
        data.set(kunci, e);
      }
      e.jumlah++;
      return { boleh: e.jumlah <= batas, sisaDetik: Math.ceil((e.resetPada - now) / 1000) };
    },
    reset(kunci) { data.delete(kunci); },
    bersihkan(now) {
      for (const [k, e] of data) if (e.resetPada <= now) data.delete(k);
    },
  };
  semuaLimiter.push(limiter);
  return limiter;
}

// Buang entri kedaluwarsa berkala biar Map tidak tumbuh terus.
setInterval(() => {
  const now = Date.now();
  for (const l of semuaLimiter) l.bersihkan(now);
}, 5 * 60 * 1000).unref?.();

/**
 * IP klien. Di VPS, Caddy menimpa X-Forwarded-For dari klien yang tidak
 * dipercaya dengan IP aslinya, jadi entri pertama bisa dipakai.
 */
export function ipKlien(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export function responsTerlaluBanyak(sisaDetik) {
  const menit = Math.max(1, Math.ceil(sisaDetik / 60));
  return Response.json(
    { error: `Terlalu banyak percobaan. Coba lagi dalam ${menit} menit.` },
    { status: 429, headers: { 'Retry-After': String(sisaDetik) } }
  );
}
