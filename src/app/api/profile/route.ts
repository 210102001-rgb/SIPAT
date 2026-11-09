import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import type { UserRow } from "@/lib/types";

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

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const row = queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [session.id],
  );
  if (!row) return fail("User tidak ditemukan", 404);
  return ok(row);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

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

  if (updates.length === 0) return fail("Tidak ada data yang diubah", 400);

  run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, [...values, session.id]);
  const updated = queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [session.id],
  );
  if (!updated) return fail("Gagal mengubah profil", 500);
  return ok(updated);
}
