// Handler untuk method yang dilayani jm-travel-api (Go) di path yang method lainnya masih Next.js
// (mis. GET /api/programs, matcher @go_programs di Caddyfile.tahap2). Di dev/prod Caddy sudah
// mengirim method ini ke Go, jadi handler ini cuma kepakai di `next dev` lokal: diteruskan ke
// GO_API_URL. Pakai persis `export const GET = teruskanKeGo;` — bentuk itu yang diizinkan
// scripts/cek-route-go.mjs.
export async function teruskanKeGo(request) {
  const go = process.env.GO_API_URL;
  if (!go) {
    return Response.json({ error: 'Endpoint ini dilayani jm-travel-api (Go). Set GO_API_URL untuk next dev lokal.' }, { status: 502 });
  }
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('host');
  const res = await fetch(go.replace(/\/$/, '') + url.pathname + url.search, {
    method: request.method,
    headers,
    redirect: 'manual',
  });
  // fetch sudah men-decode body; header encoding/panjang aslinya tidak berlaku lagi.
  const resHeaders = new Headers(res.headers);
  resHeaders.delete('content-encoding');
  resHeaders.delete('content-length');
  return new Response(res.body, { status: res.status, headers: resHeaders });
}
