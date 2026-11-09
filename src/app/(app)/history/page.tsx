"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeviceRow, EventRow, WarningLevel } from "@/lib/types";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const CLASSIFICATION_LABEL: Record<EventRow["classification"], string> = {
  normal: "Normal",
  minor: "Getaran Kecil",
  anomaly: "Anomali",
  seismic: "Gempa (Seismik)",
};

const WARNING_LABEL: Record<WarningLevel, string> = {
  normal: "Normal",
  waspada: "Waspada",
  siaga: "Siaga",
  bahaya: "Bahaya",
};

const WARNING_TONE: Record<WarningLevel, string> = {
  normal: "border-ok/40 bg-ok/10 text-ok",
  waspada: "border-warn/40 bg-warn/10 text-warn",
  siaga: "border-alert/40 bg-alert/10 text-alert",
  bahaya: "border-danger/40 bg-danger/10 text-danger",
};

const PAGE_SIZE = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvents(payload: unknown): { events: EventRow[]; total: number } {
  if (Array.isArray(payload)) {
    return { events: payload as EventRow[], total: payload.length };
  }
  if (isRecord(payload)) {
    const raw = payload.events;
    const events = Array.isArray(raw) ? (raw as EventRow[]) : [];
    const total =
      typeof payload.total === "number" ? payload.total : events.length;
    return { events, total };
  }
  return { events: [], total: 0 };
}

function parseDevices(payload: unknown): DeviceRow[] {
  if (Array.isArray(payload)) return payload as DeviceRow[];
  if (isRecord(payload) && Array.isArray(payload.devices)) {
    return payload.devices as DeviceRow[];
  }
  return [];
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputClass =
  "rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none";

export default function HistoryPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [level, setLevel] = useState<"" | WarningLevel>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const res = await fetch("/api/devices", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as ApiEnvelope<unknown>;
        if (!body.ok || cancelled) return;
        setDevices(parseDevices(body.data));
      } catch {
        // Daftar perangkat gagal dimuat; filter tetap bisa dipakai manual.
      }
    }
    void loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (deviceId) params.set("device_id", deviceId);
      if (level) params.set("level", level);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      const res = await fetch(`/api/events?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`Gagal memuat riwayat (HTTP ${res.status}).`);
        setEvents([]);
        setTotal(0);
        return;
      }
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (!body.ok) {
        setError(body.error ?? "Gagal memuat riwayat.");
        setEvents([]);
        setTotal(0);
        return;
      }
      const parsed = parseEvents(body.data);
      setEvents(parsed.events);
      setTotal(parsed.total);
    } catch {
      setError("Tidak dapat terhubung ke server.");
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [deviceId, level, from, to, page]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const resetFilters = () => {
    setDeviceId("");
    setLevel("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNext = events.length === PAGE_SIZE && page < totalPages;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Riwayat Peristiwa</h1>
        <p className="mt-1 text-sm text-muted">
          {total > 0
            ? `${total} peristiwa tercatat · ${PAGE_SIZE} per halaman · terbaru dulu`
            : "Peristiwa gempa / anomali yang pernah tercatat."}
        </p>
      </div>

      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Perangkat
            <select
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Semua perangkat</option>
              {devices.length === 0 ? (
                <option value="ESP32-001">ESP32-001</option>
              ) : (
                devices.map((d) => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.device_id} — {d.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Level peringatan
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value as "" | WarningLevel);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Semua level</option>
              <option value="normal">Normal</option>
              <option value="waspada">Waspada</option>
              <option value="siaga">Siaga</option>
              <option value="bahaya">Bahaya</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Dari tanggal
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Sampai tanggal
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-line bg-panel2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-panel"
          >
            Reset filter
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                <th className="px-4 py-3 font-semibold">Waktu</th>
                <th className="px-4 py-3 font-semibold">Perangkat</th>
                <th className="px-4 py-3 font-semibold">Klasifikasi</th>
                <th className="px-4 py-3 font-semibold">Level Peringatan</th>
                <th className="px-4 py-3 font-semibold">PGA Puncak</th>
                <th className="px-4 py-3 font-semibold">Durasi</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Memuat riwayat…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Tidak ada peristiwa yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr
                    key={ev.id}
                    onClick={() => router.push(`/history/${ev.id}`)}
                    className="cursor-pointer border-b border-line/60 transition last:border-b-0 hover:bg-panel2"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-ink">
                      {formatDateTime(ev.started_at)}
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-ink">
                      {ev.device_id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink">
                      {CLASSIFICATION_LABEL[ev.classification]}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${WARNING_TONE[ev.warning]}`}
                      >
                        {WARNING_LABEL[ev.warning]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-ink">
                      {ev.peak_pga_gal.toFixed(1)} gal
                    </td>
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-ink">
                      {ev.duration_s.toFixed(1)} dtk
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {ev.acknowledged_at ? (
                        <span className="font-semibold text-ok">Diakui</span>
                      ) : (
                        <span className="font-semibold text-warn">Belum diakui</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-xs text-muted">
            Halaman {page} dari {totalPages}
            {total > 0 ? ` · menampilkan ${events.length} dari ${total} peristiwa` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-line bg-panel2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Sebelumnya
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || loading}
              className="rounded-lg border border-line bg-panel2 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
            >
              Berikutnya →
            </button>
          </div>
        </div>
      </section>

      <p className="text-xs text-muted">
        Klik sebuah baris untuk melihat detail peristiwa, grafik sinyal, dan
        tombol acknowledge.
      </p>
    </div>
  );
}
