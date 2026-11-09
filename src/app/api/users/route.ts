import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryAll, queryOne, run } from "@/lib/db";
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

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  if (session.role !== "super_admin") return fail("forbidden", 403);

  const rows = queryAll<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY id ASC`,
    [],
  );
  return ok(rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  if (session.role !== "super_admin") return fail("forbidden", 403);

  const body = await readBody(req);
  if (!body) return fail("Data tidak valid", 400);

  const username = reqStr(body.username);
  if (!username || username.length < 3 || /\s/.test(username)) {
    return fail("Username wajib diisi, minimal 3 karakter tanpa spasi", 400);
  }
  const name = reqStr(body.name);
  if (!name) return fail("Nama wajib diisi", 400);
  const email = optStr(body.email);
  if (email !== "" && !email.includes("@")) {
    return fail("Format email tidak valid", 400);
  }
  if (typeof body.password !== "string" || body.password.length < 6) {
    return fail("Password wajib diisi, minimal 6 karakter", 400);
  }

  let role: Role = "user";
  if (body.role !== undefined) {
    if (body.role !== "super_admin" && body.role !== "user") {
      return fail("Role harus super_admin atau user", 400);
    }
    role = body.role;
  }
  let status: "active" | "disabled" = "active";
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return fail("Status harus active atau disabled", 400);
    }
    status = body.status;
  }

  const existing = queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [
    username,
  ]);
  if (existing) return fail("Username sudah digunakan", 400);

  const passwordHash = await hash(body.password, 10);
  const now = new Date().toISOString();
  const result = run(
    "INSERT INTO users (username, name, email, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [username, name, email, role, status, passwordHash, now],
  );
  const id = Number(result.lastInsertRowid);
  const created = queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [id],
  );
  if (!created) return fail("Gagal membuat user", 500);
  return ok(created, 201);
}
