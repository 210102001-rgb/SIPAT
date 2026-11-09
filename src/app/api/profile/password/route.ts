import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getSession, verifyPassword } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  let body: Record<string, unknown> | null = null;
  try {
    body = asRecord(await req.json());
  } catch {
    body = null;
  }
  if (!body) return fail("Data tidak valid", 400);

  if (typeof body.current !== "string" || body.current.length === 0) {
    return fail("Password saat ini wajib diisi", 400);
  }
  if (typeof body.new !== "string" || body.new.length < 6) {
    return fail("Password baru minimal 6 karakter", 400);
  }
  if (body.new === body.current) {
    return fail("Password baru harus berbeda dari password saat ini", 400);
  }

  const stored = queryOne<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = ?",
    [session.id],
  );
  if (!stored) return fail("User tidak ditemukan", 404);

  const matches = await verifyPassword(body.current, stored.password_hash);
  if (!matches) return fail("Password saat ini salah", 400);

  const passwordHash = await hash(body.new, 10);
  run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, session.id]);

  return ok({ changed: true });
}
