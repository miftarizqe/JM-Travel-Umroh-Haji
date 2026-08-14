'use client';
import { useMemo, useSyncExternalStore } from 'react';

function subscribe() {
  return () => {};
}

function getSnapshot() {
  try {
    return localStorage.getItem('user');
  } catch {
    return null;
  }
}

function getServerSnapshot() {
  return null;
}

// Baca user login dari localStorage lewat useSyncExternalStore, BUKAN lazy
// useState initializer — lazy initializer jalan pas render client PERTAMA,
// yaitu render yang sama yang dicocokkan React ke HTML dari server (server
// selalu "belum login" karena tidak ada localStorage), jadi kalau user
// sedang login itu memicu hydration mismatch di navbar/dashboard button.
// getServerSnapshot=null menjamin render pertama di client sama dgn server;
// React baru pakai nilai asli client setelah hydration selesai.
export function useCurrentUser() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const user = useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [raw]);
  return [user];
}
