import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne, run } from "@/lib/db";
import type { AreaRow, SessionUser } from "@/lib/types";

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

/** location_id induk dari sebuah bangunan; null bila bangunan tidak ada. */
function locationIdForBuilding(buildingId: number): number | null {
  const b = queryOne<{ location_id: number }>(
    "SELECT location_id FROM buildings WHERE id = ?",
    [buildingId],
  );
  return b ? b.location_id : null;
}

function canSee(session: SessionUser, locationId: number): boolean {
  return session.role === "super_admin" || canAccessLocation(session, locationId);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const buildingParam = req.nextUrl.searchParams.get("building_id");
  let buildingId: number | null = null;
  if (buildingParam !== null) {
    const parsed = Number(buildingParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fail("Parameter building_id tidak valid", 400);
    }
    buildingId = parsed;
  }

  if (buildingId !== null) {
    const locationId = locationIdForBuilding(buildingId);
    if (locationId === null || !canSee(session, locationId)) {
      return ok([] as AreaRow[]);
    }
    const rows = queryAll<AreaRow>(
      "SELECT * FROM areas WHERE building_id = ? ORDER BY floor ASC, name ASC",
      [buildingId],
    );
    return ok(rows);
  }

  if (session.role === "super_admin") {
    const rows = queryAll<AreaRow>("SELECT * FROM areas ORDER BY name ASC", []);
    return ok(rows);
  }

  const ids = visibleLocationIds(session);
  if (ids.length === 0) return ok([] as AreaRow[]);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = queryAll<AreaRow>(
    `SELECT a.* FROM areas a JOIN buildings b ON b.id = a.building_id WHERE b.location_id IN (${placeholders}) ORDER BY a.name ASC`,
    ids,
  );
  return ok(rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  if (typeof body.building_id !== "number" || !Number.isInteger(body.building_id)) {
    return fail("Bangunan wajib dipilih", 400);
  }
  const locationId = locationIdForBuilding(body.building_id);
  if (locationId === null) return fail("Bangunan tidak ditemukan", 400);
  if (!canSee(session, locationId)) {
    return fail("Anda tidak memiliki akses ke bangunan ini", 403);
  }

  const name = reqStr(body.name);
  if (!name) return fail("Nama area wajib diisi", 400);

  let floor = 1;
  if (body.floor !== undefined) {
    if (typeof body.floor !== "number" || !Number.isInteger(body.floor) || body.floor < 0) {
      return fail("Lantai harus bilangan bulat minimal 0", 400);
    }
    floor = body.floor;
  }

  const result = run(
    "INSERT INTO areas (building_id, name, code, floor, description) VALUES (?, ?, ?, ?, ?)",
    [body.building_id, name, optStr(body.code), floor, optStr(body.description)],
  );
  const id = Number(result.lastInsertRowid);
  const created = queryOne<AreaRow>("SELECT * FROM areas WHERE id = ?", [id]);
  if (!created) return fail("Gagal membuat area", 500);
  return ok(created, 201);
}
