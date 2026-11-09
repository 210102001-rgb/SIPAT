import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import type { EventRow, SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canSeeEvent(session: SessionUser, event: EventRow): boolean {
  if (session.role === "super_admin") return true;
  const device = queryOne<{ location_id: number }>(
    "SELECT location_id FROM devices WHERE device_id = ?",
    [event.device_id],
  );
  if (!device) return false;
  return canAccessLocation(session, device.location_id);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const eventId = parseId(id);
  if (eventId === null) return fail("Event tidak ditemukan", 404);

  const row = queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
  if (!row || !canSeeEvent(session, row)) return fail("Event tidak ditemukan", 404);
  if (row.acknowledged_at !== null) {
    return fail("Event sudah diakui sebelumnya", 400);
  }

  let by = session.name;
  try {
    const body = asRecord(await req.json());
    if (body && typeof body.by === "string" && body.by.trim().length > 0) {
      by = body.by.trim();
    }
  } catch {
    // Body kosong atau bukan JSON: pakai nama sesi.
  }

  const now = new Date().toISOString();
  const result = run(
    "UPDATE events SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND acknowledged_at IS NULL",
    [now, by, eventId],
  );
  if (result.changes === 0) {
    return fail("Event sudah diakui sebelumnya", 400);
  }

  const updated = queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
  if (!updated) return fail("Gagal mengakui event", 500);
  return ok(updated);
}
