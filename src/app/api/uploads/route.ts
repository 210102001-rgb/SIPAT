import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { uploadDir } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

function fail(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return fail("unauthorized", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Data tidak valid", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Pilih file foto dulu", 400);
  if (!file.type.startsWith("image/") || !(file.type in EXT_BY_MIME)) {
    return fail("File harus berupa gambar (JPG, PNG, WebP, atau GIF)", 400);
  }
  if (file.size === 0) return fail("File kosong", 400);
  if (file.size > MAX_BYTES) return fail("Ukuran foto maksimal 5 MB", 400);

  const name = `${randomUUID()}${EXT_BY_MIME[file.type]}`;
  try {
    await writeFile(join(uploadDir(), name), Buffer.from(await file.arrayBuffer()));
  } catch {
    return fail("Gagal menyimpan foto", 500);
  }
  return ok({ url: `/api/uploads/${name}`, filename: name }, 201);
}
