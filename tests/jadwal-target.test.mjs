import test from 'node:test';
import assert from 'node:assert/strict';
import { hariIniWib, jadwalSudahLewat, statusJadwalTarget, keTanggal } from '../src/lib/jadwalTarget.js';
// 2 Okt 2026 18:00 UTC = 3 Okt 01:00 WIB
const t = new Date('2026-10-02T18:00:00Z');
test('hari ini pakai WIB', () => assert.equal(hariIniWib(t), '2026-10-03'));
test('berangkat 2 Okt sudah lewat (WIB 3 Okt)', () => assert.equal(jadwalSudahLewat('2026-10-02', t), true));
test('berangkat hari ini belum lewat', () => assert.equal(jadwalSudahLewat('2026-10-03', t), false));
test('Date dari mysql2', () => assert.equal(keTanggal(new Date('2026-12-01T00:00:00Z')), '2026-12-01'));
test('tanpa tanggal tidak lewat', () => assert.equal(jadwalSudahLewat(null, t), false));
test('lewat + belum tercapai -> wajib', () => assert.equal(statusJadwalTarget({ tanggal_berangkat: '2026-09-01', program_aktif: true, saldo: 1, target: 100 }, t).wajib_ganti, true));
test('lewat tapi sudah tercapai -> tidak wajib', () => assert.equal(statusJadwalTarget({ tanggal_berangkat: '2026-09-01', program_aktif: true, saldo: 100, target: 100 }, t).wajib_ganti, false));
test('program nonaktif + belum tercapai -> wajib', () => assert.equal(statusJadwalTarget({ tanggal_berangkat: '2027-01-01', program_aktif: false, saldo: 0, target: 100 }, t).wajib_ganti, true));
test('normal -> tidak wajib', () => assert.equal(statusJadwalTarget({ tanggal_berangkat: '2027-01-01', program_aktif: true, saldo: 0, target: 100 }, t).wajib_ganti, false));
