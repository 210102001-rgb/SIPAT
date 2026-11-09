// GET /api/warnings/current — peringatan aktif saat ini, atau { active:false }.
import { requireSession } from "@/lib/auth";
import { getCurrentWarning } from "@/lib/simulator";


export async function GET(): Promise<Response> {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const warning = getCurrentWarning();
  return Response.json({ ok: true, data: warning ?? { active: false } });
}
