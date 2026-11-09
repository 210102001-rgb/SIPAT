import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { uploadDir } from "@/lib/db";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;
  // Nama file hanya dari server (UUID + ekstensi) — tolak path traversal.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) || filename.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return new NextResponse("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(join(uploadDir(), filename));
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
