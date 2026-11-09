// POST /api/auth/login — { username, password } → sesi + cookie httpOnly.
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, SESSION_TTL_MS, createSession, verifyPassword } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/types";


interface UserAuthRow {
  id: number;
  username: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  password_hash: string;
}

const INVALID = { ok: false, error: "Username atau kata sandi salah" } as const;

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Body permintaan tidak valid" },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || body === null) {
    return Response.json(
      { ok: false, error: "Username dan kata sandi wajib diisi" },
      { status: 400 },
    );
  }
  const { username, password } = body as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return Response.json(
      { ok: false, error: "Username dan kata sandi wajib diisi" },
      { status: 400 },
    );
  }

  const user = queryOne<UserAuthRow>("SELECT * FROM users WHERE username = ?", [username]);
  if (!user || user.status !== "active") {
    return Response.json(INVALID, { status: 401 });
  }
  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    return Response.json(INVALID, { status: 401 });
  }

  const sessionId = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });
  run("UPDATE users SET last_login_at = ? WHERE id = ?", [
    new Date().toISOString(),
    user.id,
  ]);

  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  return Response.json({ ok: true, data: { user: sessionUser } });
}
