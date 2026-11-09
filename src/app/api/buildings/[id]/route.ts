import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canSee(session: SessionUser, locationId: number): boolean {
  return session.role === "super_admin" || canAccessLocation(session, locationId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const buildingId = parseId(id);
  if (buildingId === null) return fail("Bangunan tidak ditemukan", 404);

  const row = queryOne<BuildingRow>("SELECT * FROM buildings WHERE id = ?", [buildingId]);
  if (!row || !canSee(session, row.location_id)) {
    return fail("Bangunan tidak ditemukan", 404);
  }
  return ok(row);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const buildingId = parseId(id);
  if (buildingId === null) return fail("Bangunan tidak ditemukan", 404);

  const row = queryOne<BuildingRow>("SELECT * FROM buildings WHERE id = ?", [buildingId]);
  if (!row || !canSee(session, row.location_id)) {
    return fail("Bangunan tidak ditemukan", 404);
  }

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.location_id !== undefined) {
    if (typeof body.location_id !== "number" || !Number.isInteger(body.location_id)) {
      return fail("Lokasi tidak valid", 400);
    }
    const location = queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [
      body.location_id,
    ]);
    if (!location) return fail("Lokasi tidak ditemukan", 400);
    if (!canSee(session, location.id)) {
      return fail("Anda tidak memiliki akses ke lokasi ini", 403);
    }
    updates.push("location_id = ?");
    values.push(location.id);
  }
  if (body.name !== undefined) {
    const v = reqStr(body.name);
    if (!v) return fail("Nama bangunan wajib diisi", 400);
    updates.push("name = ?");
    values.push(v);
  }
  for (const field of ["code", "type", "description"] as const) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(optStr(body[field]));
    }
  }
  if (body.floors !== undefined) {
    if (typeof body.floors !== "number" || !Number.isInteger(body.floors) || body.floors < 1) {
      return fail("Jumlah lantai harus bilangan bulat minimal 1", 400);
    }
    updates.push("floors = ?");
    values.push(body.floors);
  }

  if (updates.length === 0) return fail("Tidak ada data yang diubah", 400);

  run(`UPDATE buildings SET ${updates.join(", ")} WHERE id = ?`, [...values, buildingId]);
  const updated = queryOne<BuildingRow>("SELECT * FROM buildings WHERE id = ?", [buildingId]);
  if (!updated) return fail("Gagal mengubah bangunan", 500);
  return ok(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const buildingId = parseId(id);
  if (buildingId === null) return fail("Bangunan tidak ditemukan", 404);

  const row = queryOne<BuildingRow>("SELECT * FROM buildings WHERE id = ?", [buildingId]);
  if (!row || !canSee(session, row.location_id)) {
    return fail("Bangunan tidak ditemukan", 404);
  }

  // Kunci demo: menghapus bangunan ini ikut menghapus ESP32-001 lewat cascade.
  const demoDevice = queryOne<{ id: number }>(
    "SELECT id FROM devices WHERE building_id = ? AND device_id = 'ESP32-001'",
    [buildingId],
  );
  if (demoDevice) {
    return fail("Bangunan ini berisi perangkat demo ESP32-001 yang dikunci dan tidak bisa dihapus", 403);
  }

  run("DELETE FROM areas WHERE building_id = ?", [buildingId]);
  run("DELETE FROM devices WHERE building_id = ?", [buildingId]);
  run("DELETE FROM buildings WHERE id = ?", [buildingId]);
  return ok({ id: buildingId });
}
