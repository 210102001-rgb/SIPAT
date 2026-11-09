"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { DeviceRow, LocationRow } from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-220px)] min-h-[420px] w-full items-center justify-center rounded-xl border border-[#1E293B] bg-[#0B0F16] text-sm text-[#94A3B8]">
      Memuat peta…
    </div>
  ),
});

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json()) as Envelope<T>;
  if (!body.ok || body.data === undefined) {
    throw new Error(body.error ?? `Permintaan gagal (${res.status})`);
  }
  return body.data;
}

export default function MapPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, devs] = await Promise.all([
        api<LocationRow[]>("/api/locations"),
        api<DeviceRow[]>("/api/devices"),
      ]);
      setLocations(locs);
      setDevices(devs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat peta");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onlineCount = devices.filter((d) => d.status === "online").length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#F1F5F9]">Peta Lokasi</h1>
          <p className="text-sm text-[#94A3B8]">
            {locations.length} lokasi · {devices.length} perangkat · {onlineCount} online
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#94A3B8]">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#22C55E]" /> Ada perangkat online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#64748B]" /> Offline / tanpa perangkat
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#FCA5A5]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-[calc(100vh-220px)] min-h-[420px] w-full items-center justify-center rounded-xl border border-[#1E293B] bg-[#0B0F16] text-sm text-[#94A3B8]">
          Memuat peta…
        </div>
      ) : locations.length === 0 ? (
        <div className="flex h-[calc(100vh-220px)] min-h-[420px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-[#1E293B] bg-[#0B0F16] text-center">
          <p className="text-lg font-semibold text-[#F1F5F9]">Belum ada lokasi di peta</p>
          <p className="max-w-md text-sm text-[#94A3B8]">
            Tambahkan lokasi terlebih dahulu agar muncul di peta. Lokasi default berada di
            Surakarta (−7.5595, 110.8298).
          </p>
          <Link
            href="/locations"
            className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9]"
          >
            Kelola Lokasi
          </Link>
        </div>
      ) : (
        <MapView locations={locations} devices={devices} />
      )}
    </div>
  );
}
