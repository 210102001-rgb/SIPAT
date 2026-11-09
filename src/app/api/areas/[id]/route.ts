import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const areaId = parseId(id);
  if (areaId === null) return fail("Area tidak ditemukan", 404);

  const row = queryOne<AreaRow>("SELECT * FROM areas WHERE id = ?", [areaId]);
  if (!row) return fail("Area tidak ditemukan", 404);
  const locationId = locationIdForBuilding(row.building_id);
  if (locationId === null || !canSee(session, locationId)) {
    return fail("Area tidak ditemukan", 404);
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
  const areaId = parseId(id);
  if (areaId === null) return fail("Area tidak ditemukan", 404);

  const row = queryOne<AreaRow>("SELECT * FROM areas WHERE id = ?", [areaId]);
  if (!row) return fail("Area tidak ditemukan", 404);
  const locationId = locationIdForBuilding(row.building_id);
  if (locationId === null || !canSee(session, locationId)) {
    return fail("Area tidak ditemukan", 404);
  }

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.building_id !== undefined) {
    if (typeof body.building_id !== "number" || !Number.isInteger(body.building_id)) {
      return fail("Bangunan tidak valid", 400);
    }
    const newLocationId = locationIdForBuilding(body.building_id);
    if (newLocationId === null) return fail("Bangunan tidak ditemukan", 400);
    if (!canSee(session, newLocationId)) {
      return fail("Anda tidak memiliki akses ke bangunan ini", 403);
    }
    updates.push("building_id = ?");
    values.push(body.building_id);
  }
  if (body.name !== undefined) {
    const v = reqStr(body.name);
    if (!v) return fail("Nama area wajib diisi", 400);
    updates.push("name = ?");
    values.push(v);
  }
  if (body.code !== undefined) {
    updates.push("code = ?");
    values.push(optStr(body.code));
  }
  if (body.floor !== undefined) {
    if (typeof body.floor !== "number" || !Number.isInteger(body.floor) || body.floor < 0) {
      return fail("Lantai harus bilangan bulat minimal 0", 400);
    }
    updates.push("floor = ?");
    values.push(body.floor);
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    values.push(optStr(body.description));
  }

  if (updates.length === 0) return fail("Tidak ada data yang diubah", 400);

  run(`UPDATE areas SET ${updates.join(", ")} WHERE id = ?`, [...values, areaId]);
  const updated = queryOne<AreaRow>("SELECT * FROM areas WHERE id = ?", [areaId]);
  if (!updated) return fail("Gagal mengubah area", 500);
  return ok(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  const { id } = await params;
  const areaId = parseId(id);
  if (areaId === null) return fail("Area tidak ditemukan", 404);

  const row = queryOne<AreaRow>("SELECT * FROM areas WHERE id = ?", [areaId]);
  if (!row) return fail("Area tidak ditemukan", 404);
  const locationId = locationIdForBuilding(row.building_id);
  if (locationId === null || !canSee(session, locationId)) {
    return fail("Area tidak ditemukan", 404);
  }

  run("UPDATE devices SET area_id = NULL WHERE area_id = ?", [areaId]);
  run("DELETE FROM areas WHERE id = ?", [areaId]);
  return ok({ id: areaId });
}
