// SEISMORA — autentikasi sesi (bcryptjs + cookie httpOnly + tabel sessions).
// Cookie: `seismora_session`, httpOnly, sameSite lax, path /, maxAge 7 hari.
// Sesi disimpan di DB agar bisa dicabut dari sisi server.
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { queryAll, queryOne, run } from "./db";
import type { Role, SessionUser } from "./types";

export const COOKIE_NAME = "seismora_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionRow {
  id: number;
  username: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  expires_at: string;
}

function unauthorizedResponse(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function forbiddenResponse(): Response {
  return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const row = queryOne<SessionRow>(
    `SELECT u.id, u.username, u.name, u.email, u.role, u.status, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [sessionId],
  );
  if (!row) return null;
  if (row.status !== "active") return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    run("DELETE FROM sessions WHERE id = ?", [sessionId]);
    return null;
  }
  return { id: row.id, username: row.username, name: row.name, email: row.email, role: row.role };
}

export async function createSession(userId: number): Promise<string> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [
    sessionId,
    userId,
    expiresAt,
  ]);
  return sessionId;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (sessionId) {
    run("DELETE FROM sessions WHERE id = ?", [sessionId]);
  }
  cookieStore.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Mengembalikan sesi aktif, atau melempar Response 401 (route handler menangkap
 *  dan mengembalikannya sebagai envelope { ok:false, error:"unauthorized" }). */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw unauthorizedResponse();
  return session;
}

/** Melempar Response 403 bila sesi bukan super_admin. */
export function requireAdmin(session: SessionUser): void {
  if (session.role !== "super_admin") throw forbiddenResponse();
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(plainPassword, passwordHash);
}

export function canAccessLocation(session: SessionUser, locationId: number): boolean {
  if (session.role === "super_admin") return true;
  const row = queryOne<{ location_id: number }>(
    "SELECT location_id FROM location_users WHERE location_id = ? AND user_id = ?",
    [locationId, session.id],
  );
  return row !== null;
}

export function visibleLocationIds(session: SessionUser): number[] {
  if (session.role === "super_admin") {
    return queryAll<{ id: number }>("SELECT id FROM locations ORDER BY id").map(
      (row) => row.id,
    );
  }
  return queryAll<{ location_id: number }>(
    "SELECT location_id FROM location_users WHERE user_id = ? ORDER BY location_id",
    [session.id],
  ).map((row) => row.location_id);
}
