"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LiveChart } from "@/components/LiveChart";
import { SIG_BMKG_LEVEL } from "@/lib/signal";
import type {
  EventRow,
  Sample,
  SessionUser,
  WarningLevel,
} from "@/lib/types";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface EventDetail extends EventRow {
  snapshot?: Sample[];
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

const SIG_ROMAN = ["—", "I", "II", "III", "IV", "V"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSamples(value: unknown): Sample[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is Sample =>
      isRecord(s) &&
      typeof s.t === "number" &&
      typeof s.x === "number" &&
      typeof s.y === "number" &&
      typeof s.z === "number" &&
      typeof s.r === "number",
  );
}

function parseEventDetail(payload: unknown): EventDetail | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.event)) {
    const base = payload.event as unknown as EventRow;
    const snapshot = parseSamples(payload.snapshot);
    return { ...base, snapshot };
  }
  const base = payload as unknown as EventRow;
  if (typeof base.id !== "number") return null;
  let snapshot: Sample[] = [];
  if (Array.isArray(payload.snapshot)) {
    snapshot = parseSamples(payload.snapshot);
  } else if (typeof payload.snapshot_json === "string" && payload.snapshot_json) {
    try {
      snapshot = parseSamples(JSON.parse(payload.snapshot_json) as unknown);
    } catch {
      snapshot = [];
    }
  } else if (typeof base.snapshot_json === "string" && base.snapshot_json) {
    try {
      snapshot = parseSamples(JSON.parse(base.snapshot_json) as unknown);
    } catch {
      snapshot = [];
    }
  }
  return { ...base, snapshot };
}

async function fetchEnvelope<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) return null;
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) return null;
  return body.data ?? null;
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
    second: "2-digit",
  });
}

export default function HistoryDetailPage() {
  const params = useParams();
  const rawId = params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Peristiwa tidak ditemukan."
            : `Gagal memuat detail peristiwa (HTTP ${res.status}).`,
        );
        setEvent(null);
        return;
      }
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (!body.ok) {
        setError(body.error ?? "Gagal memuat detail peristiwa.");
        setEvent(null);
        return;
      }
      const parsed = parseEventDetail(body.data);
      if (!parsed) {
        setError("Respons server tidak dapat dibaca.");
        setEvent(null);
        return;
      }
      setEvent(parsed);
    } catch {
      setError("Tidak dapat terhubung ke server.");
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const me = await fetchEnvelope<SessionUser>("/api/auth/me");
        if (!cancelled) setIsAdmin(me?.role === "super_admin");
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    }
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledge = async () => {
    if (!event) return;
    setAcknowledging(true);
    setAckError(null);
    try {
      let by = "";
      try {
        const me = await fetchEnvelope<SessionUser>("/api/auth/me");
        if (me) by = me.username;
      } catch {
        // Nama pengguna tidak wajib; lanjutkan tanpa nama.
      }
      const res = await fetch(`/api/events/${event.id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by }),
      });
      if (!res.ok) {
        setAckError(`Gagal mengakui peringatan (HTTP ${res.status}).`);
        return;
      }
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (!body.ok) {
        setAckError(body.error ?? "Gagal mengakui peringatan.");
        return;
      }
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: by || prev.acknowledged_by,
            }
          : prev,
      );
    } catch {
      setAckError("Tidak dapat terhubung ke server.");
    } finally {
      setAcknowledging(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Detail Peristiwa</h1>
        <p className="text-sm text-muted">Memuat…</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Detail Peristiwa</h1>
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error ?? "Peristiwa tidak ditemukan."}
        </p>
        <a href="/history" className="text-sm font-semibold text-action hover:underline">
          ← Kembali ke Riwayat
        </a>
      </div>
    );
  }

  const sigLevel = SIG_BMKG_LEVEL(event.peak_pga_gal);
  const sigRoman = SIG_ROMAN[sigLevel];
  const snapshot = event.snapshot ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Peristiwa #{event.id} — {CLASSIFICATION_LABEL[event.classification]}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Perangkat <span className="font-mono text-ink">{event.device_id}</span>
            {" · "}Mulai {formatDateTime(event.started_at)}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${WARNING_TONE[event.warning]}`}
        >
          Peringatan: {WARNING_LABEL[event.warning]}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            PGA Puncak
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {event.peak_pga_gal.toFixed(1)} gal
          </p>
          <p className="text-xs text-muted">
            Level SIG-BMKG {sigRoman} ({sigLevel}/5)
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            RMS Puncak
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {event.peak_rms.toFixed(3)} m/s²
          </p>
          <p className="text-xs text-muted">Root mean square maksimum</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Frekuensi Dominan
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {event.dominant_freq.toFixed(1)} Hz
          </p>
          <p className="text-xs text-muted">Hasil analisis FFT</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Durasi
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-ink">
            {event.duration_s.toFixed(1)} dtk
          </p>
          <p className="text-xs text-muted">Sinyal di atas ambang 0,3 m/s²</p>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-bold text-ink">Keterangan Peristiwa</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-line/60 py-2">
            <dt className="text-muted">Klasifikasi</dt>
            <dd className="font-semibold text-ink">
              {CLASSIFICATION_LABEL[event.classification]}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line/60 py-2">
            <dt className="text-muted">Level peringatan</dt>
            <dd className="font-semibold text-ink">{WARNING_LABEL[event.warning]}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line/60 py-2">
            <dt className="text-muted">Mulai</dt>
            <dd className="font-mono text-ink">{formatDateTime(event.started_at)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line/60 py-2">
            <dt className="text-muted">Berakhir</dt>
            <dd className="font-mono text-ink">{formatDateTime(event.ended_at)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line/60 py-2">
            <dt className="text-muted">Status</dt>
            <dd className="font-semibold text-ink">
              {event.acknowledged_at ? "Diakui" : "Belum diakui"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line/60 py-2">
            <dt className="text-muted">Diakui oleh</dt>
            <dd className="font-semibold text-ink">
              {event.acknowledged_by ?? "—"}
            </dd>
          </div>
        </dl>
        {event.acknowledged_at ? (
          <p className="mt-3 text-sm text-muted">
            Diakui pada {formatDateTime(event.acknowledged_at)}
            {event.acknowledged_by ? ` oleh ${event.acknowledged_by}` : ""}.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-bold text-ink">
          Grafik Sinyal (Snapshot Peristiwa)
        </h2>
        <p className="mt-1 text-xs text-muted">
          Garis: X (cyan) · Y (hijau) · Z (kuning) · Resultan (putih, tebal).
        </p>
        {snapshot.length > 0 ? (
          <div className="mt-3">
            <LiveChart data={snapshot} height={300} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Tidak ada snapshot sinyal untuk peristiwa ini.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-bold text-ink">Acknowledge</h2>
        {event.acknowledged_at ? (
          <p className="mt-2 text-sm text-ok">
            Peringatan ini sudah diakui
            {event.acknowledged_by ? ` oleh ${event.acknowledged_by}` : ""} pada{" "}
            {formatDateTime(event.acknowledged_at)}.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Tandai peringatan ini sebagai sudah diketahui dan ditindaklanjuti.
            </p>
            <button
              type="button"
              onClick={() => {
                void acknowledge();
              }}
              disabled={acknowledging}
              className="mt-3 rounded-lg bg-action px-5 py-2.5 text-sm font-bold text-white transition hover:bg-action/80 disabled:cursor-wait disabled:opacity-60"
            >
              {acknowledging ? "Menyimpan…" : "Saya Mengerti — Akui Peringatan"}
            </button>
            {ackError ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger">
                {ackError}
              </p>
            ) : null}
          </>
        )}
        {!isAdmin ? (
          <p className="mt-4 rounded-lg border border-line bg-panel2 px-3 py-2 text-xs text-muted">
            Peringatan tidak dapat dihapus.
          </p>
        ) : null}
      </section>

      <a href="/history" className="inline-block text-sm font-semibold text-action hover:underline">
        ← Kembali ke Riwayat
      </a>
    </div>
  );
}
