'use client';
import { useEffect, useRef } from 'react';

// Pasang warning native browser ("Leave site? Changes may not be saved")
// pas user nutup tab / refresh sementara ada input yang belum disimpan.
// Peringatan tombol back/nav dalam-app diatur terpisah lewat prop
// confirmLeave di <Layout>, bukan di sini.
export function useUnsavedGuard(isDirty) {
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
