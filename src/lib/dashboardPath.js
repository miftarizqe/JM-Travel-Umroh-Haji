export function dashboardPathForRole(role) {
  if (role === 'admin' || role === 'super_admin') return '/admin';
  if (role === 'hop') return '/dashboard/sahabat/hop';
  if (role === 'sahabat_baitullah') return '/dashboard/sahabat';
  return `/dashboard/${role}`;
}
