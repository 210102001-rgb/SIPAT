import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryAll, queryOne, run } from "@/lib/db";
import type { LocationRow, SessionUser } from "@/lib/types";

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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Lokasi terlihat oleh admin, atau oleh user yang terdaftar di location_users. */
function visible(session: SessionUser, locationId: number): boolean {
  return session.role === "super_admin" || canAccessLocation(session, locationId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const locationId = parseId(id);
  if (locationId === null) return fail("Lokasi tidak ditemukan", 404);

  const row = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row || !visible(session, locationId)) return fail("Lokasi tidak ditemukan", 404);
  return ok(row);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const locationId = parseId(id);
  if (locationId === null) return fail("Lokasi tidak ditemukan", 404);

  const row = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row || !visible(session, locationId)) return fail("Lokasi tidak ditemukan", 404);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  let newOwnerId: number | null = null;

  if (body.name !== undefined) {
    const v = reqStr(body.name);
    if (!v) return fail("Nama lokasi wajib diisi", 400);
    updates.push("name = ?");
    values.push(v);
  }
  const stringFields = ["type", "province", "city", "district", "address", "photo_url", "description"] as const;
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(optStr(body[field]));
    }
  }
  if (body.lat !== undefined) {
    if (typeof body.lat !== "number" || !Number.isFinite(body.lat) || body.lat < -90 || body.lat > 90) {
      return fail("Latitude harus di antara -90 dan 90", 400);
    }
    updates.push("lat = ?");
    values.push(body.lat);
  }
  if (body.lng !== undefined) {
    if (typeof body.lng !== "number" || !Number.isFinite(body.lng) || body.lng < -180 || body.lng > 180) {
      return fail("Longitude harus di antara -180 dan 180", 400);
    }
    updates.push("lng = ?");
    values.push(body.lng);
  }
  if (body.owner_id !== undefined) {
    if (session.role !== "super_admin") {
      return fail("Hanya admin yang dapat mengubah pemilik lokasi", 403);
    }
    if (typeof body.owner_id !== "number" || !Number.isInteger(body.owner_id)) {
      return fail("Pemilik tidak valid", 400);
    }
    const owner = queryOne<{ id: number }>("SELECT id FROM users WHERE id = ?", [
      body.owner_id,
    ]);
    if (!owner) return fail("Pemilik tidak ditemukan", 400);
    newOwnerId = body.owner_id;
    updates.push("owner_id = ?");
    values.push(newOwnerId);
  }

  if (updates.length === 0) return fail("Tidak ada data yang diubah", 400);

  run(`UPDATE locations SET ${updates.join(", ")} WHERE id = ?`, [...values, locationId]);
  if (newOwnerId !== null) {
    run("INSERT OR IGNORE INTO location_users (location_id, user_id) VALUES (?, ?)", [
      locationId,
      newOwnerId,
    ]);
  }

  const updated = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!updated) return fail("Gagal mengubah lokasi", 500);
  return ok(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const locationId = parseId(id);
  if (locationId === null) return fail("Lokasi tidak ditemukan", 404);

  const row = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [locationId]);
  if (!row || !visible(session, locationId)) return fail("Lokasi tidak ditemukan", 404);

  // Kunci demo: menghapus lokasi ini ikut menghapus ESP32-001 lewat cascade.
  const demoDevice = queryOne<{ id: number }>(
    "SELECT id FROM devices WHERE location_id = ? AND device_id = 'ESP32-001'",
    [locationId],
  );
  if (demoDevice) {
    return fail("Lokasi ini berisi perangkat demo ESP32-001 yang dikunci dan tidak bisa dihapus", 403);
  }

  // Hapus turunan agar tidak ada bangunan/perangkat yatim.
  const buildings = queryAll<{ id: number }>(
    "SELECT id FROM buildings WHERE location_id = ?",
    [locationId],
  );
  for (const b of buildings) {
    run("DELETE FROM areas WHERE building_id = ?", [b.id]);
  }
  run("DELETE FROM buildings WHERE location_id = ?", [locationId]);
  run("DELETE FROM devices WHERE location_id = ?", [locationId]);
  run("DELETE FROM location_users WHERE location_id = ?", [locationId]);
  run("DELETE FROM locations WHERE id = ?", [locationId]);

  return ok({ id: locationId });
}
