import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne, run } from "@/lib/db";
import type { DeviceRow, SessionUser } from "@/lib/types";

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

function reqStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optStr(value: unknown, fallback = ""): string {
  const s = reqStr(value);
  return s === null ? fallback : s;
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return asRecord(await req.json());
  } catch {
    return null;
  }
}

function parseFilterInt(raw: string | null, name: string): number | null {
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Parameter ${name} tidak valid`);
  }
  return parsed;
}

function canSee(session: SessionUser, locationId: number): boolean {
  return session.role === "super_admin" || canAccessLocation(session, locationId);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  let locationId: number | null;
  let buildingId: number | null;
  let areaId: number | null;
  try {
    locationId = parseFilterInt(req.nextUrl.searchParams.get("location_id"), "location_id");
    buildingId = parseFilterInt(req.nextUrl.searchParams.get("building_id"), "building_id");
    areaId = parseFilterInt(req.nextUrl.searchParams.get("area_id"), "area_id");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Parameter tidak valid", 400);
  }

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (locationId !== null) {
    if (!canSee(session, locationId)) return ok([] as DeviceRow[]);
    conditions.push("location_id = ?");
    values.push(locationId);
  } else if (session.role !== "super_admin") {
    const ids = visibleLocationIds(session);
    if (ids.length === 0) return ok([] as DeviceRow[]);
    const placeholders = ids.map(() => "?").join(", ");
    conditions.push(`location_id IN (${placeholders})`);
    values.push(...ids);
  }
  if (buildingId !== null) {
    conditions.push("building_id = ?");
    values.push(buildingId);
  }
  if (areaId !== null) {
    conditions.push("area_id = ?");
    values.push(areaId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = queryAll<DeviceRow>(
    `SELECT * FROM devices ${where} ORDER BY name ASC`,
    values,
  );
  return ok(rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const deviceId = reqStr(body.device_id);
  if (!deviceId) return fail("Device ID wajib diisi", 400);
  const name = reqStr(body.name);
  if (!name) return fail("Nama perangkat wajib diisi", 400);

  const existing = queryOne<{ id: number }>("SELECT id FROM devices WHERE device_id = ?", [
    deviceId,
  ]);
  if (existing) return fail("Device ID sudah digunakan", 400);

  if (typeof body.location_id !== "number" || !Number.isInteger(body.location_id)) {
    return fail("Lokasi wajib dipilih", 400);
  }
  const location = queryOne<{ id: number }>("SELECT id FROM locations WHERE id = ?", [
    body.location_id,
  ]);
  if (!location) return fail("Lokasi tidak ditemukan", 400);
  if (!canSee(session, body.location_id)) {
    return fail("Anda tidak memiliki akses ke lokasi ini", 403);
  }

  let buildingId: number | null = null;
  if (body.building_id !== undefined && body.building_id !== null) {
    if (typeof body.building_id !== "number" || !Number.isInteger(body.building_id)) {
      return fail("Bangunan tidak valid", 400);
    }
    const building = queryOne<{ id: number; location_id: number }>(
      "SELECT id, location_id FROM buildings WHERE id = ?",
      [body.building_id],
    );
    if (!building) return fail("Bangunan tidak ditemukan", 400);
    if (building.location_id !== body.location_id) {
      return fail("Bangunan tidak berada di lokasi yang dipilih", 400);
    }
    buildingId = body.building_id;
  }

  let areaId: number | null = null;
  if (body.area_id !== undefined && body.area_id !== null) {
    if (typeof body.area_id !== "number" || !Number.isInteger(body.area_id)) {
      return fail("Area tidak valid", 400);
    }
    const area = queryOne<{ id: number; building_id: number }>(
      "SELECT id, building_id FROM areas WHERE id = ?",
      [body.area_id],
    );
    if (!area) return fail("Area tidak ditemukan", 400);
    if (buildingId !== null && area.building_id !== buildingId) {
      return fail("Area tidak berada di bangunan yang dipilih", 400);
    }
    areaId = body.area_id;
  }

  let status: "online" | "offline" = "offline";
  if (body.status !== undefined) {
    if (body.status !== "online" && body.status !== "offline") {
      return fail("Status harus online atau offline", 400);
    }
    status = body.status;
  }

  let intervalMs = 100;
  if (body.interval_ms !== undefined) {
    if (
      typeof body.interval_ms !== "number" ||
      !Number.isInteger(body.interval_ms) ||
      body.interval_ms <= 0
    ) {
      return fail("Interval harus bilangan bulat positif (ms)", 400);
    }
    intervalMs = body.interval_ms;
  }

  const result = run(
    "INSERT INTO devices (device_id, name, sensor_type, location_id, building_id, area_id, status, interval_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      deviceId,
      name,
      optStr(body.sensor_type, "MPU6050"),
      body.location_id,
      buildingId,
      areaId,
      status,
      intervalMs,
    ],
  );
  const id = Number(result.lastInsertRowid);
  const created = queryOne<DeviceRow>("SELECT * FROM devices WHERE id = ?", [id]);
  if (!created) return fail("Gagal membuat perangkat", 500);
  return ok(created, 201);
}
