import { NextRequest, NextResponse } from "next/server";
import { getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";
import type { EventRow, SessionUser, WarningLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const LEVELS: WarningLevel[] = ["normal", "waspada", "siaga", "bahaya"];

function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Device ID yang boleh dilihat sesi ini.
 * null = semua perangkat (admin); [] = tidak ada perangkat yang terlihat.
 */
function visibleDeviceIds(session: SessionUser): string[] | null {
  if (session.role === "super_admin") return null;
  const locationIds = visibleLocationIds(session);
  if (locationIds.length === 0) return [];
  const placeholders = locationIds.map(() => "?").join(", ");
  const rows = queryAll<{ device_id: string }>(
    `SELECT device_id FROM devices WHERE location_id IN (${placeholders})`,
    locationIds,
  );
  return rows.map((r) => r.device_id);
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
  const deviceId = params.get("device_id");
  const level = params.get("level");
  const from = params.get("from");
  const to = params.get("to");
  const pageRaw = params.get("page");

  if (level !== null && !(LEVELS as string[]).includes(level)) {
    return fail("Level harus salah satu dari: normal, waspada, siaga, bahaya", 400);
  }
  if (from !== null && Number.isNaN(Date.parse(from))) {
    return fail("Format tanggal from tidak valid", 400);
  }
  if (to !== null && Number.isNaN(Date.parse(to))) {
    return fail("Format tanggal to tidak valid", 400);
  }
  let page = 1;
  if (pageRaw !== null) {
    const parsed = Number(pageRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return fail("Parameter page tidak valid", 400);
    }
    page = parsed;
  }

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  const deviceIds = visibleDeviceIds(session);
  if (deviceIds !== null) {
    if (deviceIds.length === 0) {
      return ok({ items: [], page, page_size: PAGE_SIZE, total: 0, total_pages: 0 });
    }
    const placeholders = deviceIds.map(() => "?").join(", ");
    conditions.push(`device_id IN (${placeholders})`);
    values.push(...deviceIds);
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
  const totalRow = queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM events ${where}`,
    values,
  );
  const total = totalRow ? totalRow.total : 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const offset = (page - 1) * PAGE_SIZE;

  const items = queryAll<EventRow>(
    `SELECT * FROM events ${where} ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...values, PAGE_SIZE, offset],
  );

  return ok({ items, page, page_size: PAGE_SIZE, total, total_pages: totalPages });
}
