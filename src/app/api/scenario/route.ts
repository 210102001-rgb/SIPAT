// /api/scenario — GET skenario aktif; POST ganti skenario (admin saja).
// Hanya memengaruhi perangkat demo ESP32-001 (simulasi).
import { NextRequest } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth";
import { getScenario, setScenario } from "@/lib/simulator";
import type { Scenario, SessionUser } from "@/lib/types";


const VALID_SCENARIOS: Scenario[] = ["normal", "minor", "anomaly", "seismic"];

async function authSession(): Promise<SessionUser | Response> {
  try {
    return await requireSession();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export async function GET(): Promise<Response> {
  const session = await authSession();
  if (session instanceof Response) return session;
  return Response.json({ ok: true, data: { scenario: getScenario() } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await authSession();
  if (session instanceof Response) return session;
  try {
    requireAdmin(session);
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Body permintaan tidak valid" },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || body === null || !("scenario" in body)) {
    return Response.json({ ok: false, error: "Skenario tidak valid" }, { status: 400 });
  }
  const next = (body as { scenario?: unknown }).scenario;
  if (typeof next !== "string" || !VALID_SCENARIOS.includes(next as Scenario)) {
    return Response.json({ ok: false, error: "Skenario tidak valid" }, { status: 400 });
  }
  setScenario(next as Scenario);
  return Response.json({ ok: true, data: { scenario: getScenario() } });
}
