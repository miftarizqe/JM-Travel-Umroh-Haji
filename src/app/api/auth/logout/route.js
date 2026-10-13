/**
 * API Logout.
 *
 * Diperlukan karena cookie token sekarang httpOnly — frontend TIDAK BISA
 * menghapusnya lewat JavaScript. Server yang harus menghapusnya.
 */
import { headersCookieSesi } from '@/lib/auth';

export async function POST(request) {
  return new Response(
    JSON.stringify({ message: 'Logout berhasil.' }),
    {
      status: 200,
      // Max-Age=0 -> browser langsung menghapus cookie (termasuk varian
      // Path/Domain lama yang nyangkut, lihat headerHapusTokenLama)
      headers: headersCookieSesi(request, '', 0),
    }
  );
}
