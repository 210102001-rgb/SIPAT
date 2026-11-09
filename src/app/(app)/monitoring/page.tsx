"use client";

import { useEffect, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import { StatCard } from "@/components/StatCard";
import type {
  Classification,
  DeviceRow,
  Metrics,
  Sample,
  Scenario,
  TickMsg,
  WarningLevel,
} from "@/lib/types";

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  normal: "Normal",
  minor: "Getaran Kecil",
  anomaly: "Anomali",
  seismic: "Potensi Gempa",
};

const CLASSIFICATION_TONE: Record<Classification, string> = {
  normal: "border-ok/40 bg-ok/10 text-ok",
  minor: "border-warn/40 bg-warn/10 text-warn",
  anomaly: "border-alert/40 bg-alert/10 text-alert",
  seismic: "border-danger/40 bg-danger/10 text-danger",
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

type StreamStatus = "connecting" | "live" | "reconnecting";

export default function MonitoringPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("ESP32-001");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [devicesError, setDevicesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDevices() {
      try {
        const res = await fetch("/api/devices", { cache: "no-store" });
        const body: { ok: boolean; data?: DeviceRow[]; error?: string } =
          await res.json();
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.data) {
          setDevicesError("Gagal memuat daftar perangkat.");
          return;
        }
        setDevices(body.data);
        if (body.data.length > 0) {
          const hasDefault = body.data.some((d) => d.device_id === "ESP32-001");
          setSelectedDevice(hasDefault ? "ESP32-001" : body.data[0].device_id);
        }
      } catch {
        if (!cancelled) setDevicesError("Tidak dapat terhubung ke server.");
      }
    }
    loadDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSamples([]);
    setMetrics(null);
    setScenario(null);
    setStatus("connecting");

    const es = new EventSource(
      `/api/stream?device_id=${encodeURIComponent(selectedDevice)}`,
    );

    es.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg: TickMsg = JSON.parse(event.data) as TickMsg;
        if (msg.type !== "tick") return;
        setSamples((prev) => [...prev, ...msg.samples].slice(-120));
        setMetrics(msg.metrics);
        setScenario(msg.scenario);
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
  }, [selectedDevice]);

  const selected = devices.find((d) => d.device_id === selectedDevice);
  const warning: WarningLevel = metrics?.warning ?? "normal";
  const classification: Classification = metrics?.classification ?? "normal";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Monitoring Langsung</h1>
          <p className="mt-1 text-sm text-muted">
            SIPAT AI v1.0 — rule-based demo classifier
          </p>
        </div>
        <span
          className={
            status === "live"
              ? "rounded-full border border-ok/40 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok"
              : "rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-xs font-semibold text-warn"
          }
          role="status"
        >
          {status === "live"
            ? "● Live"
            : status === "connecting"
              ? "Menghubungkan…"
              : "Menghubungkan ulang…"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          Perangkat
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
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
        {selected ? (
          <span className="text-sm text-muted">
            {selected.name} · {selected.sensor_type} ·{" "}
            <span
              className={
                selected.status === "online" ? "font-semibold text-ok" : "font-semibold text-danger"
              }
            >
              {selected.status === "online" ? "Online" : "Offline"}
            </span>
          </span>
        ) : null}
        {devicesError ? (
          <span className="text-sm text-danger">{devicesError}</span>
        ) : null}
      </div>

      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-ink">
            Sinyal Akselerasi (m/s²)
          </h2>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${CLASSIFICATION_TONE[classification]}`}
            >
              {CLASSIFICATION_LABEL[classification]}
              {metrics ? ` · ${(metrics.confidence * 100).toFixed(0)}%` : ""}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${WARNING_TONE[warning]}`}
            >
              Peringatan: {WARNING_LABEL[warning]}
            </span>
          </span>
        </div>
        <LiveChart data={samples} height={300} />
        <p className="mt-2 text-xs text-muted">
          Garis: X (cyan) · Y (hijau) · Z (kuning) · Resultan (putih, tebal).
          {scenario ? ` Skenario aktif: ${scenario}.` : ""}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="PGA"
          value={metrics ? `${metrics.pga_gal.toFixed(1)} gal` : "—"}
          sub={
            metrics
              ? `Level SIG-BMKG ${SIG_ROMAN[metrics.sig_level]} (${metrics.sig_level}/5)`
              : "Skala intensitas SIG-BMKG"
          }
          tone={
            warning === "bahaya"
              ? "red"
              : warning === "siaga"
                ? "orange"
                : warning === "waspada"
                  ? "yellow"
                  : "green"
          }
        />
        <StatCard
          label="RMS"
          value={metrics ? `${metrics.rms.toFixed(3)} m/s²` : "—"}
          sub="Root mean square jendela 5 detik"
          tone="cyan"
        />
        <StatCard
          label="Frekuensi Dominan"
          value={metrics ? `${metrics.freq_hz.toFixed(1)} Hz` : "—"}
          sub="Hasil analisis FFT (0,5–20 Hz)"
          tone="cyan"
        />
        <StatCard
          label="Amplitudo"
          value={metrics ? `${metrics.amp_ms2.toFixed(2)} m/s²` : "—"}
          sub="Amplitudo maksimum resultan"
          tone="cyan"
        />
        <StatCard
          label="Durasi"
          value={metrics ? `${metrics.duration_s.toFixed(1)} dtk` : "—"}
          sub="Sinyal di atas ambang 0,3 m/s²"
          tone="cyan"
        />
        <StatCard
          label="Kepercayaan Klasifikasi"
          value={metrics ? `${(metrics.confidence * 100).toFixed(0)}%` : "—"}
          sub={CLASSIFICATION_LABEL[classification]}
          tone="slate"
        />
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Simulasi demo — sensor MPU6050 kelas prototipe; PGA bukan magnitudo.
        Klasifikasi bersifat rule-based untuk keperluan lomba, bukan sistem
        peringatan resmi BMKG.
      </p>
    </div>
  );
}
