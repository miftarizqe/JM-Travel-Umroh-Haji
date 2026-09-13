'use client';
import { useState } from 'react';

// Input password reusable dengan tombol tampil/sembunyi (mata) — dipasang di
// semua form isi password (login, register, ganti password, dst) biar user
// bisa cek ketikannya sebelum submit. className diteruskan ke <input> apa
// adanya (tiap halaman punya style beda), cuma nambah padding kanan biar gak
// ketiban tombol matanya.
export default function PasswordInput({ className = '', ...props }) {
  const [tampil, setTampil] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={tampil ? 'text' : 'password'}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setTampil(v => !v)}
        tabIndex={-1}
        aria-label={tampil ? 'Sembunyikan password' : 'Tampilkan password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {tampil ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
