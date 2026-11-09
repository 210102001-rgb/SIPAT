// POST /api/auth/logout — hapus sesi + cookie.
import { destroySession } from "@/lib/auth";


export async function POST(): Promise<Response> {
  await destroySession();
  return Response.json({ ok: true, data: { loggedOut: true } });
}
