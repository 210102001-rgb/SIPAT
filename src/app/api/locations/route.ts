import { NextRequest, NextResponse } from "next/server";
import { getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne, run } from "@/lib/db";
import type { LocationRow } from "@/lib/types";

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

function optNum(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return asRecord(await req.json());
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  if (session.role === "super_admin") {
    const rows = queryAll<LocationRow>("SELECT * FROM locations ORDER BY name ASC", []);
    return ok(rows);
  }

  const ids = visibleLocationIds(session);
  if (ids.length === 0) return ok([] as LocationRow[]);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = queryAll<LocationRow>(
    `SELECT * FROM locations WHERE id IN (${placeholders}) ORDER BY name ASC`,
    ids,
  );
  return ok(rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const name = reqStr(body.name);
  if (!name) return fail("Nama lokasi wajib diisi", 400);

  const lat = optNum(body.lat, 0);
  const lng = optNum(body.lng, 0);
  if (lat < -90 || lat > 90) return fail("Latitude harus di antara -90 dan 90", 400);
  if (lng < -180 || lng > 180) return fail("Longitude harus di antara -180 dan 180", 400);

  let ownerId = session.id;
  if (session.role === "super_admin" && typeof body.owner_id === "number") {
    const owner = queryOne<{ id: number }>("SELECT id FROM users WHERE id = ?", [
      body.owner_id,
    ]);
    if (!owner) return fail("Pemilik tidak ditemukan", 400);
    ownerId = body.owner_id;
  }

  const result = run(
    "INSERT INTO locations (name, type, province, city, district, address, lat, lng, photo_url, description, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      optStr(body.type, "Lainnya"),
      optStr(body.province),
      optStr(body.city),
      optStr(body.district),
      optStr(body.address),
      lat,
      lng,
      optStr(body.photo_url),
      optStr(body.description),
      ownerId,
    ],
  );
  const id = Number(result.lastInsertRowid);
  run("INSERT OR IGNORE INTO location_users (location_id, user_id) VALUES (?, ?)", [
    id,
    ownerId,
  ]);

  const created = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [id]);
  if (!created) return fail("Gagal membuat lokasi", 500);
  return ok(created, 201);
}
