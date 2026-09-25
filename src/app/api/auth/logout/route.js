/**
 * API Logout.
 *
 * Diperlukan karena cookie token sekarang httpOnly — frontend TIDAK BISA
 * menghapusnya lewat JavaScript. Server yang harus menghapusnya.
 */
import { headerCookieToken } from '@/lib/auth';

export async function POST() {
  return new Response(
    JSON.stringify({ message: 'Logout berhasil.' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Max-Age=0 -> browser langsung menghapus cookie
        'Set-Cookie': headerCookieToken('', 0),
      },
    }
  );
}
