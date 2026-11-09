import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import type { Role, UserRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const USER_COLUMNS =
  "id, username, name, email, role, status, created_at, last_login_at";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  if (session.role !== "super_admin") return fail("forbidden", 403);

  const { id } = await params;
  const userId = parseId(id);
  if (userId === null) return fail("User tidak ditemukan", 404);

  const row = queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
  if (!row) return fail("User tidak ditemukan", 404);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  if (
    userId === session.id &&
    (body.role !== undefined || body.status !== undefined)
  ) {
    return fail("Tidak dapat mengubah peran atau status akun sendiri", 400);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.name !== undefined) {
    const v = reqStr(body.name);
    if (!v) return fail("Nama wajib diisi", 400);
    updates.push("name = ?");
    values.push(v);
  }
  if (body.email !== undefined) {
    const v = optStr(body.email);
    if (v !== "" && !v.includes("@")) {
      return fail("Format email tidak valid", 400);
    }
    updates.push("email = ?");
    values.push(v);
  }
  if (body.role !== undefined) {
    if (body.role !== "super_admin" && body.role !== "user") {
      return fail("Role harus super_admin atau user", 400);
    }
    const role: Role = body.role;
    updates.push("role = ?");
    values.push(role);
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return fail("Status harus active atau disabled", 400);
    }
    updates.push("status = ?");
    values.push(body.status);
  }

  if (updates.length === 0) return fail("Tidak ada data yang diubah", 400);

  run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, [...values, userId]);
  const updated = queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [userId],
  );
  if (!updated) return fail("Gagal mengubah user", 500);
  return ok(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  if (session.role !== "super_admin") return fail("forbidden", 403);

  const { id } = await params;
  const userId = parseId(id);
  if (userId === null) return fail("User tidak ditemukan", 404);

  const row = queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
  if (!row) return fail("User tidak ditemukan", 404);
  if (userId === session.id) {
    return fail("Tidak dapat menghapus akun sendiri", 400);
  }
  if (row.role === "super_admin") {
    const count = queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin'",
      [],
    );
    if (count && count.total <= 1) {
      return fail("Tidak dapat menghapus satu-satunya super admin", 400);
    }
  }

  run("DELETE FROM location_users WHERE user_id = ?", [userId]);
  run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  run("DELETE FROM users WHERE id = ?", [userId]);
  return ok({ id: userId });
}
