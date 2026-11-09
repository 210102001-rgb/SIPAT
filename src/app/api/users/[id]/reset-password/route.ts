import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import type { UserRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Reset password user menjadi "user123" (admin only).
 * Mengembalikan password sementara agar admin dapat menyampaikannya ke user;
 * hash tidak pernah dikembalikan.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);
  if (session.role !== "super_admin") return fail("forbidden", 403);

  const { id } = await params;
  const userId = parseId(id);
  if (userId === null) return fail("User tidak ditemukan", 404);

  const row = queryOne<UserRow>("SELECT id, username FROM users WHERE id = ?", [userId]);
  if (!row) return fail("User tidak ditemukan", 404);

  const passwordHash = await hash("user123", 10);
  run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);

  return ok({ id: userId, username: row.username, temporary_password: "user123" });
}
