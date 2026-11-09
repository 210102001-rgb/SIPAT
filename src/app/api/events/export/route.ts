import { NextRequest, NextResponse } from "next/server";
import { getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll } from "@/lib/db";
import type { EventRow, WarningLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

const LEVELS: WarningLevel[] = ["normal", "waspada", "siaga", "bahaya"];

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeFrom(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

function normalizeTo(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const params = req.nextUrl.searchParams;
  const format = params.get("format");
  if (format !== null && format !== "csv") {
    return fail("Format harus csv", 400);
  }

  const deviceId = params.get("device_id");
  const level = params.get("level");
  const from = params.get("from");
  const to = params.get("to");

  if (level !== null && !(LEVELS as string[]).includes(level)) {
    return fail("Level harus salah satu dari: normal, waspada, siaga, bahaya", 400);
  }
  if (from !== null && Number.isNaN(Date.parse(from))) {
    return fail("Format tanggal from tidak valid", 400);
  }
  if (to !== null && Number.isNaN(Date.parse(to))) {
    return fail("Format tanggal to tidak valid", 400);
  }

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (session.role !== "super_admin") {
    const locationIds = visibleLocationIds(session);
    if (locationIds.length === 0) {
      return csvResponse([]);
    }
    const placeholders = locationIds.map(() => "?").join(", ");
    const devices = queryAll<{ device_id: string }>(
      `SELECT device_id FROM devices WHERE location_id IN (${placeholders})`,
      locationIds,
    );
    if (devices.length === 0) {
      return csvResponse([]);
    }
    const devicePlaceholders = devices.map(() => "?").join(", ");
    conditions.push(`device_id IN (${devicePlaceholders})`);
    values.push(...devices.map((d) => d.device_id));
  }
  if (deviceId) {
    conditions.push("device_id = ?");
    values.push(deviceId);
  }
  if (level) {
    conditions.push("warning = ?");
    values.push(level);
  }
  if (from) {
    conditions.push("started_at >= ?");
    values.push(normalizeFrom(from));
  }
  if (to) {
    conditions.push("started_at <= ?");
    values.push(normalizeTo(to));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = queryAll<EventRow>(
    `SELECT * FROM events ${where} ORDER BY started_at DESC, id DESC`,
    values,
  );
  return csvResponse(rows);
}

function csvResponse(rows: EventRow[]): NextResponse {
  const header =
    "id,device_id,started_at,ended_at,classification,warning,peak_pga_gal,peak_rms,dominant_freq,duration_s";
  const lines = rows.map((r) =>
    [
      csvCell(r.id),
      csvCell(r.device_id),
      csvCell(r.started_at),
      csvCell(r.ended_at),
      csvCell(r.classification),
      csvCell(r.warning),
      csvCell(r.peak_pga_gal),
      csvCell(r.peak_rms),
      csvCell(r.dominant_freq),
      csvCell(r.duration_s),
    ].join(","),
  );
  const csv = [header, ...lines].join("\r\n") + "\r\n";
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sipat-events-${today}.csv"`,
    },
  });
}
