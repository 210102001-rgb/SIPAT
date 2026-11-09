import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import type { EventRow, Sample, SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseSnapshot(snapshotJson: string | null): Sample[] {
  if (!snapshotJson) return [];
  try {
    const parsed: unknown = JSON.parse(snapshotJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Sample =>
        typeof item === "object" &&
        item !== null &&
        "t" in item &&
        "x" in item &&
        "y" in item &&
        "z" in item &&
        "r" in item,
    );
  } catch {
    return [];
  }
}

/** Event terlihat bila perangkatnya berada di lokasi yang bisa diakses sesi ini. */
function canSeeEvent(session: SessionUser, event: EventRow): boolean {
  if (session.role === "super_admin") return true;
  const device = queryOne<{ location_id: number }>(
    "SELECT location_id FROM devices WHERE device_id = ?",
    [event.device_id],
  );
  if (!device) return false;
  return canAccessLocation(session, device.location_id);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const eventId = parseId(id);
  if (eventId === null) return fail("Event tidak ditemukan", 404);

  const row = queryOne<EventRow>("SELECT * FROM events WHERE id = ?", [eventId]);
  if (!row || !canSeeEvent(session, row)) return fail("Event tidak ditemukan", 404);

  return ok({ ...row, snapshot: parseSnapshot(row.snapshot_json) });
}
