/**
 * API Logout.
 *
 * Diperlukan karena cookie token sekarang httpOnly — frontend TIDAK BISA
 * menghapusnya lewat JavaScript. Server yang harus menghapusnya.
 */
export async function POST() {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';

  return new Response(
    JSON.stringify({ message: 'Logout berhasil.' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Max-Age=0 -> browser langsung menghapus cookie
        'Set-Cookie': `token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;${secure}`,
      },
    }
  );
}
