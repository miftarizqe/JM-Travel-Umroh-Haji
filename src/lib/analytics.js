// Wrapper tipis di atas gtag.js (GA4) & fbq (Meta Pixel) — dua-duanya di-load
// lewat next/script di root layout (lihat src/app/layout.tsx), cuma aktif
// kalau NEXT_PUBLIC_GA_ID / NEXT_PUBLIC_FB_PIXEL_ID diisi di .env. Aman
// dipanggil dari mana saja (SSR maupun sebelum script kelar load) — no-op
// kalau window.gtag/fbq belum ada.

export function trackLead(params = {}) {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', 'generate_lead', params);
  window.fbq?.('track', 'Lead', params);
}
