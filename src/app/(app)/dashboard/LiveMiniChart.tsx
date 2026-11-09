"use client";

import { useEffect, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import type { Sample, TickMsg } from "@/lib/types";

interface LiveMiniChartProps {
  deviceId: string;
}

export default function LiveMiniChart({ deviceId }: LiveMiniChartProps) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  );

  useEffect(() => {
    setSamples([]);
    setStatus("connecting");
    const es = new EventSource(
      `/api/stream?device_id=${encodeURIComponent(deviceId)}`,
    );

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg: TickMsg = JSON.parse(event.data) as TickMsg;
        if (msg.type !== "tick") return;
        setSamples((prev) => [...prev, ...msg.samples].slice(-120));
        setStatus("live");
      } catch {
        // Abaikan pesan yang tidak bisa diparse; stream tetap berjalan.
      }
    };

    es.onerror = () => {
      setStatus("reconnecting");
    };

    return () => {
      es.close();
    };
  }, [deviceId]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-muted">
          Sinyal langsung — {deviceId}
        </p>
        <span
          className={
            status === "live"
              ? "text-xs font-semibold text-ok"
              : "text-xs font-semibold text-warn"
          }
        >
          {status === "live"
            ? "● Live"
            : status === "connecting"
              ? "Menghubungkan…"
              : "Menghubungkan ulang…"}
        </span>
      </div>
      <LiveChart data={samples} height={220} />
    </div>
  );
}
