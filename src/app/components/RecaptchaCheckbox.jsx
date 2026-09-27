'use client';
import { useEffect, useRef, useState } from 'react';

let scriptPromise = null;
function muatScriptRecaptcha() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    window.__onRecaptchaLoad = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?onload=__onRecaptchaLoad&render=explicit';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Widget "Saya bukan robot" dari Google reCAPTCHA v2 — dipasang di step
// terakhir form registrasi (dikonfirmasi user 2026-09-27). Kalau site key
// belum diisi (NEXT_PUBLIC_RECAPTCHA_SITE_KEY kosong), widget ini gak
// dirender sama sekali & verifikasinya di-skip juga di server (lihat
// RECAPTCHA_SECRET_KEY di src/lib/recaptcha.js) — biar dev lokal & deploy
// awal tetap bisa jalan sebelum key-nya didaftarkan ke Google reCAPTCHA
// admin console (https://www.google.com/recaptcha/admin/create).
export default function RecaptchaCheckbox({ onChange }) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const elRef = useRef(null);
  const widgetId = useRef(null);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    let batal = false;
    muatScriptRecaptcha().then(() => { if (!batal) setSiap(true); });
    return () => { batal = true; };
  }, [siteKey]);

  useEffect(() => {
    if (!siap || !elRef.current || widgetId.current !== null) return;
    widgetId.current = window.grecaptcha.render(elRef.current, {
      sitekey: siteKey,
      callback: (token) => onChange(token),
      'expired-callback': () => onChange(''),
    });
  }, [siap, siteKey, onChange]);

  if (!siteKey) return null;
  return <div ref={elRef} />;
}
