"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Classification,
  Scenario,
  SessionUser,
  WarningLevel,
} from "@/lib/types";

interface CurrentWarning {
  active: boolean;
  event_id?: number | null;
  level?: WarningLevel;
  classification?: Classification;
  pga_gal?: number;
  sig_level?: number;
  device_id?: string;
  device_name?: string;
  location_name?: string;
  started_at?: string;
  confidence?: number;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const SCENARIO_OPTIONS: {
  value: Scenario;
  label: string;
  desc: string;
  buttonClass: string;
}[] = [
  {
    value: "normal",
    label: "Normal",
    desc: "Getaran latar rendah, tanpa peringatan.",
    buttonClass: "border-ok/50 bg-ok/10 text-ok hover:bg-ok/20",
  },
  {
    value: "minor",
    label: "Getaran Kecil",
    desc: "Getaran 0,3–0,8 m/s² sesaat — kendaraan / mesin.",
    buttonClass: "border-warn/50 bg-warn/10 text-warn hover:bg-warn/20",
  },
  {
    value: "anomaly",
    label: "Anomali",
    desc: "Lonjakan tajam 1–3 m/s² — memicu WASPADA.",
    buttonClass: "border-alert/50 bg-alert/10 text-alert hover:bg-alert/20",
  },
  {
    value: "seismic",
    label: "Gempa (Seismik)",
    desc: "Osilasi berkelanjutan 10–20 dtk — memicu SIAGA / BAHAYA.",
    buttonClass: "border-danger/50 bg-danger/10 text-danger hover:bg-danger/20",
  },
];

const SCENARIO_LABEL: Record<Scenario, string> = {
  normal: "Normal",
  minor: "Getaran Kecil",
  anomaly: "Anomali",
  seismic: "Gempa (Seismik)",
};

const CLASSIFICATION_LABEL: Record<Classification, string> = {
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

async function fetchEnvelope<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) return null;
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) return null;
  return body.data ?? null;
}

function parseScenario(payload: unknown): Scenario | null {
  if (typeof payload === "string") {
    return payload === "normal" ||
      payload === "minor" ||
      payload === "anomaly" ||
      payload === "seismic"
      ? payload
      : null;
  }
  if (typeof payload === "object" && payload !== null && "scenario" in payload) {
    const s = (payload as { scenario?: unknown }).scenario;
    return typeof s === "string" &&
      (s === "normal" || s === "minor" || s === "anomaly" || s === "seismic")
      ? s
      : null;
  }
  return null;
}

export default function ScenarioPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [warning, setWarning] = useState<CurrentWarning | null>(null);
  const [saving, setSaving] = useState<Scenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const data = await fetchEnvelope<SessionUser>("/api/auth/me");
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadScenario = useCallback(async () => {
    try {
      const res = await fetch("/api/scenario", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (!body.ok) return;
      const s = parseScenario(body.data);
      if (s) setScenario(s);
    } catch {
      // Gagal memuat: biarkan tampilan menunjukkan "—" hingga poll berikut.
    }
  }, []);

  useEffect(() => {
    if (me?.role !== "super_admin") return;
    void loadScenario();
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchEnvelope<CurrentWarning>("/api/warnings/current");
        if (!cancelled) setWarning(data);
      } catch {
        // Poll peringatan gagal: strip metrik dibiarkan apa adanya.
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
      void loadScenario();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [me, loadScenario]);

  const setScenarioValue = async (value: Scenario) => {
    setSaving(value);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: value }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          setError("Akses ditolak: hanya admin yang boleh mengubah skenario.");
        } else {
          setError(`Gagal mengubah skenario (HTTP ${res.status}).`);
        }
        return;
      }
      const body = (await res.json()) as ApiEnvelope<unknown>;
      if (!body.ok) {
        setError(body.error ?? "Gagal mengubah skenario.");
        return;
      }
      const s = parseScenario(body.data);
      setScenario(s ?? value);
      setNotice(
        value === "normal"
          ? "Skenario dihentikan — sistem kembali normal."
          : `Skenario "${SCENARIO_LABEL[value]}" aktif.`,
      );
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setSaving(null);
    }
  };

  if (meLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Kontrol Skenario</h1>
        <p className="text-sm text-muted">Memuat…</p>
      </div>
    );
  }

  if (!me || me.role !== "super_admin") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Kontrol Skenario</h1>
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-6">
          <p className="text-lg font-bold text-danger">Akses ditolak</p>
          <p className="mt-1 text-sm text-muted">
            Halaman Kontrol Skenario hanya dapat diakses oleh Super Admin.
          </p>
        </div>
      </div>
    );
  }

  const activeWarning: WarningLevel =
    warning && warning.active && warning.level ? warning.level : "normal";
  const sigLevel = warning?.sig_level ?? 0;
  const sigRoman =
    sigLevel >= 1 && sigLevel <= 5 ? SIG_ROMAN[sigLevel] : SIG_ROMAN[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Kontrol Skenario</h1>
        <p className="mt-1 text-sm text-muted">
          Kontrol demo — hanya memengaruhi perangkat simulasi ESP32-001.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-sm text-muted">
          Skenario aktif saat ini:{" "}
          <span className="font-mono text-base font-bold text-ink">
            {scenario ? SCENARIO_LABEL[scenario] : "—"}
          </span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SCENARIO_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              void setScenarioValue(opt.value);
            }}
            disabled={saving !== null}
            className={`rounded-xl border-2 p-5 text-left transition disabled:cursor-wait disabled:opacity-60 ${opt.buttonClass} ${
              scenario === opt.value ? "ring-2 ring-ink/40" : ""
            }`}
          >
            <span className="block text-xl font-bold">{opt.label}</span>
            <span className="mt-1 block text-sm font-medium text-ink/80">
              {opt.desc}
            </span>
            <span className="mt-3 block text-sm font-bold">
              {saving === opt.value
                ? "Mengaktifkan…"
                : scenario === opt.value
                  ? "● Aktif"
                  : "Aktifkan skenario ini"}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          void setScenarioValue("normal");
        }}
        disabled={saving !== null || scenario === "normal"}
        className="w-full rounded-xl border border-line bg-panel2 px-5 py-4 text-base font-bold text-ink transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving === "normal" ? "Menghentikan…" : "Berhenti / Kembali Normal"}
      </button>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border border-ok/40 bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">
          {notice}
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-bold text-ink">Metrik Langsung</h2>
        <p className="mt-1 text-xs text-muted">
          Diperbarui setiap 2 detik dari /api/warnings/current.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-line bg-panel2 p-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              PGA
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-ink">
              {warning && warning.active
                ? `${(warning.pga_gal ?? 0).toFixed(1)} gal`
                : "—"}
            </p>
            <p className="text-xs text-muted">
              Level SIG-BMKG {sigRoman} ({sigLevel}/5)
            </p>
          </div>
          <div className="rounded-lg border border-line bg-panel2 p-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Klasifikasi
            </p>
            <p className="mt-1 text-base font-bold text-ink">
              {warning && warning.active && warning.classification
                ? CLASSIFICATION_LABEL[warning.classification]
                : "—"}
            </p>
            <p className="text-xs text-muted">
              {warning?.confidence != null
                ? `Kepercayaan ${(warning.confidence * 100).toFixed(0)}%`
                : "SIPAT AI v1.0 — rule-based"}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-panel2 p-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Peringatan
            </p>
            <p className="mt-2">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${WARNING_TONE[activeWarning]}`}
              >
                {WARNING_LABEL[activeWarning]}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted">
              {warning?.location_name ?? "ESP32-001"}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-panel2 p-3">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Perangkat
            </p>
            <p className="mt-1 font-mono text-base font-bold text-ink">
              {warning?.device_id ?? "ESP32-001"}
            </p>
            <p className="text-xs text-muted">
              {warning?.device_name ?? "Sensor Gedung A"}
            </p>
          </div>
        </div>
      </section>

      <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-warn">
        Catatan kejujuran demo: semua data di halaman ini adalah data simulasi
        yang dibangkitkan oleh simulator backend (tanpa sensor ESP32/MPU6050
        nyata). Skenario di atas hanya mengubah pola getaran simulasi untuk
        keperluan demo lomba — bukan gempa sungguhan dan bukan peringatan resmi
        BMKG.
      </p>
    </div>
  );
}
