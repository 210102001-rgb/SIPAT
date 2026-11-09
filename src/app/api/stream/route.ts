// GET /api/stream?device_id=ESP32-001 — Server-Sent Events, 1 pesan/detik.
// Perangkat demo ESP32-001: tick live dari simulator. Perangkat lain yang
// ada di DB (offline, tanpa data simulator): tick dengan metrik nol dan
// warning normal. device_id yang tidak ada di DB → 404.
import { NextRequest } from "next/server";
import { canAccessLocation, getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { getCurrentMetrics, getRecentSamples, getScenario } from "@/lib/simulator";
import type { DeviceRow, Metrics, TickMsg } from "@/lib/types";


const OFFLINE_METRICS: Metrics = {
  pga_gal: 0,
  sig_level: 1,
  rms: 0,
  freq_hz: 0,
  amp_ms2: 0,
  duration_s: 0,
  classification: "normal",
  confidence: 1,
  warning: "normal",
};

export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const deviceId = request.nextUrl.searchParams.get("device_id");
  if (!deviceId) {
    return Response.json({ ok: false, error: "device_id wajib diisi" }, { status: 400 });
  }
  const device = queryOne<DeviceRow>("SELECT * FROM devices WHERE device_id = ?", [
    deviceId,
  ]);
  if (!device) {
    return Response.json(
      { ok: false, error: "Perangkat tidak ditemukan" },
      { status: 404 },
    );
  }
  if (session.role !== "super_admin" && !canAccessLocation(session, device.location_id)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const isDemo = deviceId === "ESP32-001";
  const encoder = new TextEncoder();
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let beatTimer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const sendTick = (): void => {
        try {
          const tick: TickMsg = isDemo
            ? {
                type: "tick",
                device_id: deviceId,
                samples: getRecentSamples(10),
                metrics: getCurrentMetrics(),
                scenario: getScenario(),
                at: new Date().toISOString(),
              }
            : {
                type: "tick",
                device_id: deviceId,
                samples: [],
                metrics: { ...OFFLINE_METRICS },
                scenario: "normal",
                at: new Date().toISOString(),
              };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(tick)}\n\n`));
        } catch {
          if (tickTimer !== undefined) clearInterval(tickTimer);
          if (beatTimer !== undefined) clearInterval(beatTimer);
        }
      };
      sendTick();
      tickTimer = setInterval(sendTick, 1000);
      beatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (tickTimer !== undefined) clearInterval(tickTimer);
          if (beatTimer !== undefined) clearInterval(beatTimer);
        }
      }, 15000);
    },
    cancel() {
      if (tickTimer !== undefined) clearInterval(tickTimer);
      if (beatTimer !== undefined) clearInterval(beatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
