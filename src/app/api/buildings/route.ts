import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne, run } from "@/lib/db";
import type { BuildingRow, LocationRow, SessionUser } from "@/lib/types";

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

function canSeeLocation(session: SessionUser, locationId: number): boolean {
  return session.role === "super_admin" || canAccessLocation(session, locationId);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const locationParam = req.nextUrl.searchParams.get("location_id");
  let locationId: number | null = null;
  if (locationParam !== null) {
    const parsed = Number(locationParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fail("Parameter location_id tidak valid", 400);
    }
    locationId = parsed;
  }

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (locationId !== null) {
    if (!canSeeLocation(session, locationId)) return ok([] as BuildingRow[]);
    conditions.push("location_id = ?");
    values.push(locationId);
  } else if (session.role !== "super_admin") {
    const ids = visibleLocationIds(session);
    if (ids.length === 0) return ok([] as BuildingRow[]);
    const placeholders = ids.map(() => "?").join(", ");
    conditions.push(`location_id IN (${placeholders})`);
    values.push(...ids);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = queryAll<BuildingRow>(
    `SELECT * FROM buildings ${where} ORDER BY name ASC`,
    values,
  );
  return ok(rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  if (typeof body.location_id !== "number" || !Number.isInteger(body.location_id)) {
    return fail("Lokasi wajib dipilih", 400);
  }
  const location = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [
    body.location_id,
  ]);
  if (!location) return fail("Lokasi tidak ditemukan", 400);
  if (!canSeeLocation(session, location.id)) {
    return fail("Anda tidak memiliki akses ke lokasi ini", 403);
  }

  const name = reqStr(body.name);
  if (!name) return fail("Nama bangunan wajib diisi", 400);

  let floors = 1;
  if (body.floors !== undefined) {
    if (typeof body.floors !== "number" || !Number.isInteger(body.floors) || body.floors < 1) {
      return fail("Jumlah lantai harus bilangan bulat minimal 1", 400);
    }
    floors = body.floors;
  }

  const result = run(
    "INSERT INTO buildings (location_id, name, code, type, floors, description) VALUES (?, ?, ?, ?, ?, ?)",
    [
      location.id,
      name,
      optStr(body.code),
      optStr(body.type),
      floors,
      optStr(body.description),
    ],
  );
  const id = Number(result.lastInsertRowid);
  const created = queryOne<BuildingRow>("SELECT * FROM buildings WHERE id = ?", [id]);
  if (!created) return fail("Gagal membuat bangunan", 500);
  return ok(created, 201);
}
