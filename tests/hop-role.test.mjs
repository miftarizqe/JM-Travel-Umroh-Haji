import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { wajibRole } from '../src/lib/auth.js';
import { dashboardPathForRole } from '../src/lib/dashboardPath.js';

const secret = 'test-only-hop-role-secret';

function requestFor(role, method = 'GET') {
  const token = jwt.sign({ id: 42, role }, secret);
  return new Request('https://example.test/api/admin/dashboard', {
    method,
    headers: { cookie: `token=${token}` },
  });
}

test('HoP cannot read or mutate ordinary Admin endpoints (Sahabat-only via hopAuth)', () => {
  process.env.JWT_SECRET = secret;
  assert.equal(wajibRole(requestFor('hop', 'GET'), ['admin']).error.status, 403);
  assert.equal(wajibRole(requestFor('hop', 'POST'), ['admin']).error.status, 403);
  assert.equal(wajibRole(requestFor('hop', 'PUT'), ['admin']).error.status, 403);
  assert.equal(wajibRole(requestFor('hop', 'PATCH'), ['admin']).error.status, 403);
  assert.equal(wajibRole(requestFor('hop', 'DELETE'), ['admin']).error.status, 403);
});

test('Admin access is unchanged and HoP cannot access super-admin endpoints', () => {
  process.env.JWT_SECRET = secret;
  assert.equal(wajibRole(requestFor('admin', 'GET'), ['admin']).user.role, 'admin');
  assert.equal(wajibRole(requestFor('admin', 'POST'), ['admin']).user.role, 'admin');
  assert.equal(wajibRole(requestFor('hop', 'GET'), ['super_admin']).error.status, 403);
});

test('Sahabat does not gain Admin read or write access', () => {
  process.env.JWT_SECRET = secret;
  assert.equal(wajibRole(requestFor('sahabat_baitullah', 'GET'), ['admin']).error.status, 403);
  assert.equal(wajibRole(requestFor('sahabat_baitullah', 'POST'), ['admin']).error.status, 403);
});

test('HoP Sahabat pages: role hop reads only, Sahabat is never treated as HoP', async () => {
  process.env.JWT_SECRET = secret;
  const { wajibAdminAtauHopSahabat, wajibHopSahabat } = await import('../src/lib/hopAuth.js');
  assert.equal((await wajibAdminAtauHopSahabat(requestFor('hop', 'GET'))).user.role, 'hop');
  assert.equal((await wajibAdminAtauHopSahabat(requestFor('hop', 'POST'))).error.status, 403);
  assert.equal((await wajibAdminAtauHopSahabat(requestFor('sahabat_baitullah', 'GET'))).error.status, 403);
  assert.equal((await wajibAdminAtauHopSahabat(requestFor('admin', 'POST'))).user.role, 'admin');
  assert.equal((await wajibHopSahabat(requestFor('hop', 'POST'))).user.role, 'hop');
  assert.equal((await wajibHopSahabat(requestFor('sahabat_baitullah', 'POST'))).error.status, 403);
});

test('HoP lands on its dedicated dashboard while other roles keep their dashboards', () => {
  assert.equal(dashboardPathForRole('hop'), '/dashboard/sahabat/hop');
  assert.equal(dashboardPathForRole('admin'), '/admin');
  assert.equal(dashboardPathForRole('sahabat_baitullah'), '/dashboard/sahabat');
});
