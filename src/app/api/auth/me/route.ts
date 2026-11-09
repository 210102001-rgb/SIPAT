// GET /api/auth/me — sesi aktif saat ini.
import { getSession } from "@/lib/auth";


export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true, data: session });
}
