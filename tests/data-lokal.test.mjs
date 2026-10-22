import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage tiruan (Object.keys harus mengembalikan key yang tersimpan, sama seperti browser).
const simpan = {};
globalThis.localStorage = new Proxy(simpan, {
  get: (t, k) => ({ getItem: x => t[x] ?? null, setItem: (x, v) => { t[x] = String(v); }, removeItem: x => { delete t[x]; } })[k] ?? t[k],
  ownKeys: t => Reflect.ownKeys(t),
  getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k),
});
const { bersihkanDataLokalAkun } = await import('../src/lib/dataLokal.js');

test('logout membuang cache user & draft formulir jamaah, referral & preferensi tetap', () => {
  Object.assign(simpan, {
    user: '{"id":"a"}', 'draft_form_jamaah_JMT-1': '{"nik":"3201"}', 'draft_form_jamaah_JMT-2': '{}',
    ref_perwakilan: 'PWK1', ref_agen: '{"id":"x"}', admin_sidebar_collapsed: '1', promo_dismissed_id: '3',
  });
  bersihkanDataLokalAkun();
  assert.deepEqual(Object.keys(simpan).sort(), ['admin_sidebar_collapsed', 'promo_dismissed_id', 'ref_agen', 'ref_perwakilan']);
});
