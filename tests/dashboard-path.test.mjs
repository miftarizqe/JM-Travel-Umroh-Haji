import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPathForRole } from '../src/lib/dashboardPath.js';

test('HoP lands on its dedicated dashboard while other roles keep their dashboards', () => {
  assert.equal(dashboardPathForRole('hop'), '/dashboard/sahabat/hop');
  assert.equal(dashboardPathForRole('admin'), '/admin');
  assert.equal(dashboardPathForRole('sahabat_baitullah'), '/dashboard/sahabat');
});
