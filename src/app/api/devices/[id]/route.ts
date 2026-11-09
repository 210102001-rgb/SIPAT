import { NextRequest, NextResponse } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
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
  const deviceId = parseId(id);
  if (deviceId === null) return fail("Perangkat tidak ditemukan", 404);

  const row = queryOne<DeviceRow>("SELECT * FROM devices WHERE id = ?", [deviceId]);
  if (!row || !canSee(session, row.location_id)) {
    return fail("Perangkat tidak ditemukan", 404);
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
  const deviceId = parseId(id);
  if (deviceId === null) return fail("Perangkat tidak ditemukan", 404);

  const row = queryOne<DeviceRow>("SELECT * FROM devices WHERE id = ?", [deviceId]);
  if (!row || !canSee(session, row.location_id)) {
    return fail("Perangkat tidak ditemukan", 404);
  }

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  let nextLocationId = row.location_id;
  let nextBuildingId = row.building_id;

  if (body.device_id !== undefined) {
    const v = reqStr(body.device_id);
    if (!v) return fail("Device ID wajib diisi", 400);
    // Perangkat demo dikunci: simulator, dashboard, monitoring, dan skenario
    // semuanya mengacu ke ESP32-001; mengganti ID-nya mematikan demo live.
    if (row.device_id === "ESP32-001" && v !== row.device_id) {
      return fail("Perangkat demo ESP32-001 dikunci dan tidak bisa diganti ID-nya", 403);
    }
    if (v !== row.device_id) {
      const clash = queryOne<{ id: number }>(
        "SELECT id FROM devices WHERE device_id = ?",
        [v],
      );
      if (clash) return fail("Device ID sudah digunakan", 400);
    }
    updates.push("device_id = ?");
    values.push(v);
  }
  if (body.name !== undefined) {
    const v = reqStr(body.name);
    if (!v) return fail("Nama perangkat wajib diisi", 400);
    updates.push("name = ?");
    values.push(v);
  }
  if (body.sensor_type !== undefined) {
    updates.push("sensor_type = ?");
    values.push(optStr(body.sensor_type, "MPU6050"));
  }
  if (body.location_id !== undefined) {
    if (typeof body.location_id !== "number" || !Number.isInteger(body.location_id)) {
      return fail("Lokasi tidak valid", 400);
    }
    const location = queryOne<{ id: number }>("SELECT id FROM locations WHERE id = ?", [
      body.location_id,
    ]);
    if (!location) return fail("Lokasi tidak ditemukan", 400);
    if (!canSee(session, body.location_id)) {
      return fail("Anda tidak memiliki akses ke lokasi ini", 403);
    }
    nextLocationId = body.location_id;
    updates.push("location_id = ?");
    values.push(nextLocationId);
  }
  if (body.building_id !== undefined) {
    if (body.building_id === null) {
      nextBuildingId = null;
      updates.push("building_id = ?");
      values.push(null);
    } else {
      if (typeof body.building_id !== "number" || !Number.isInteger(body.building_id)) {
        return fail("Bangunan tidak valid", 400);
      }
      const building = queryOne<{ id: number; location_id: number }>(
        "SELECT id, location_id FROM buildings WHERE id = ?",
        [body.building_id],
      );
      if (!building) return fail("Bangunan tidak ditemukan", 400);
      if (building.location_id !== nextLocationId) {
        return fail("Bangunan tidak berada di lokasi yang dipilih", 400);
      }
      nextBuildingId = body.building_id;
      updates.push("building_id = ?");
      values.push(nextBuildingId);
    }
  }
  if (body.area_id !== undefined) {
    if (body.area_id === null) {
      updates.push("area_id = ?");
      values.push(null);
    } else {
      if (typeof body.area_id !== "number" || !Number.isInteger(body.area_id)) {
        return fail("Area tidak valid", 400);
      }
      const area = queryOne<{ id: number; building_id: number }>(
        "SELECT id, building_id FROM areas WHERE id = ?",
        [body.area_id],
      );
      if (!area) return fail("Area tidak ditemukan", 400);
      if (nextBuildingId !== null && area.building_id !== nextBuildingId) {
        return fail("Area tidak berada di bangunan yang dipilih", 400);
      }
      updates.push("area_id = ?");
      values.push(body.area_id);
    }
  }
  if (body.status !== undefined) {
    if (body.status !== "online" && body.status !== "offline") {
      return fail("Status harus online atau offline", 400);
    }
    updates.push("status = ?");
    values.push(body.status);
  }
  if (body.interval_ms !== undefined) {
    if (
      typeof body.interval_ms !== "number" ||
      !Number.isInteger(body.interval_ms) ||
      body.interval_ms <= 0
    ) {
      return fail("Interval harus bilangan bulat positif (ms)", 400);
    }
    updates.push("interval_ms = ?");
    values.push(body.interval_ms);
  }

  if (updates.length === 0) return fail("Tidak ada data yang diubah", 400);

  run(`UPDATE devices SET ${updates.join(", ")} WHERE id = ?`, [...values, deviceId]);
  const updated = queryOne<DeviceRow>("SELECT * FROM devices WHERE id = ?", [deviceId]);
  if (!updated) return fail("Gagal mengubah perangkat", 500);
  return ok(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const { id } = await params;
  const deviceId = parseId(id);
  if (deviceId === null) return fail("Perangkat tidak ditemukan", 404);

  const row = queryOne<DeviceRow>("SELECT * FROM devices WHERE id = ?", [deviceId]);
  if (!row || !canSee(session, row.location_id)) {
    return fail("Perangkat tidak ditemukan", 404);
  }

  // Perangkat demo dikunci: ESP32-001 adalah satu-satunya sumber data
  // simulator; menghapusnya mematikan dashboard/monitoring/skenario live.
  // Pernah terhapus tanpa sengaja oleh akun demo (7 Nov 2026) dan harus
  // dipulihkan manual sebagai admin. Admin bisa membuka kunci ini dari kode.
  if (row.device_id === "ESP32-001") {
    return fail("Perangkat demo ESP32-001 dikunci dan tidak bisa dihapus", 403);
  }

  run("DELETE FROM devices WHERE id = ?", [deviceId]);
  return ok({ id: deviceId });
}
