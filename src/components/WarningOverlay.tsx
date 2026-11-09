"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SAFETY_TEXT } from "@/lib/signal";
import type { Classification, SessionUser, WarningLevel } from "@/lib/types";

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

type AlertLevel = "waspada" | "siaga" | "bahaya";

const LEVEL_BG: Record<AlertLevel, string> = {
  waspada: "#EAB308",
  siaga: "#F97316",
  bahaya: "#EF4444",
};

const LEVEL_LABEL: Record<AlertLevel, string> = {
  waspada: "WASPADA",
  siaga: "SIAGA",
  bahaya: "BAHAYA",
};

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  normal: "Normal",
  minor: "Getaran Kecil",
  anomaly: "Anomali",
  seismic: "Gempa (Seismik)",
};

const SIG_ROMAN = ["—", "I", "II", "III", "IV", "V"];

function formatDateTime(value: string | undefined): string {
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

async function fetchEnvelope<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) return null;
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) return null;
  return body.data ?? null;
}

export default function WarningOverlay() {
  const [warning, setWarning] = useState<CurrentWarning | null>(null);
  const [ackedEventId, setAckedEventId] = useState<number | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmTimerRef = useRef<number | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const stopAlarm = useCallback(() => {
    if (alarmTimerRef.current !== null) {
      window.clearInterval(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }
    if (oscRef.current) {
      try {
        oscRef.current.stop();
      } catch {
        // Oscillator sudah berhenti; abaikan.
      }
      oscRef.current = null;
    }
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const AC = window.AudioContext;
    if (!AC) return null;
    try {
      audioCtxRef.current = new AC();
    } catch {
      return null;
    }
    return audioCtxRef.current;
  }, []);

  const beep = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      oscRef.current = osc;
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio tidak tersedia; overlay tetap tampil tanpa bunyi.
    }
  }, [getAudioContext]);

  const startAlarm = useCallback(() => {
    if (alarmTimerRef.current !== null) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    beep();
    alarmTimerRef.current = window.setInterval(beep, 1000);
  }, [beep, getAudioContext]);

  const shouldAlarm =
    warning !== null &&
    warning.active &&
    (warning.level === "siaga" || warning.level === "bahaya") &&
    warning.event_id != null &&
    ackedEventId !== warning.event_id;
  const shouldAlarmRef = useRef(shouldAlarm);
  shouldAlarmRef.current = shouldAlarm;

  // Aturan autoplay browser: AudioContext hanya boleh berbunyi setelah gestur
  // pengguna. Coba mulai saat mount, dan lanjutkan pada sentuhan/klik pertama.
  useEffect(() => {
    const resumeOnGesture = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
      if (shouldAlarmRef.current) startAlarm();
    };
    window.addEventListener("pointerdown", resumeOnGesture, { once: true });
    return () => window.removeEventListener("pointerdown", resumeOnGesture);
  }, [getAudioContext, startAlarm]);

  useEffect(() => {
    if (shouldAlarm) {
      startAlarm();
    } else {
      stopAlarm();
    }
  }, [shouldAlarm, startAlarm, stopAlarm]);

  useEffect(() => {
    return () => {
      stopAlarm();
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => undefined);
      }
    };
  }, [stopAlarm]);

  // Poll peringatan aktif setiap 2 detik. Gagal fetch = diam, coba lagi poll berikut.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchEnvelope<CurrentWarning>("/api/warnings/current");
        if (cancelled) return;
        if (!data || !data.active) {
          setWarning(null);
          return;
        }
        setWarning(data);
      } catch {
        // API tidak terjangkau: jangan blokir aplikasi, retry pada poll berikut.
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Pulihkan status acknowledge dari sessionStorage saat event berubah.
  const eventId = warning?.event_id ?? null;
  useEffect(() => {
    if (eventId == null) {
      setAckedEventId(null);
      return;
    }
    try {
      if (sessionStorage.getItem(`seismora_ack_${eventId}`) === "1") {
        setAckedEventId(eventId);
      } else {
        setAckedEventId(null);
      }
    } catch {
      setAckedEventId(null);
    }
  }, [eventId]);

  const acknowledge = async () => {
    if (!warning || warning.event_id == null) return;
    const id = warning.event_id;
    setAcknowledging(true);
    try {
      let by = "";
      try {
        const me = await fetchEnvelope<SessionUser>("/api/auth/me");
        if (me) by = me.username;
      } catch {
        // Nama pengguna tidak wajib untuk acknowledge; lanjutkan tanpa nama.
      }
      try {
        await fetch(`/api/events/${id}/acknowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ by }),
        });
      } catch {
        // Server tidak terjangkau: tetap sembunyikan overlay secara lokal.
      }
      try {
        sessionStorage.setItem(`seismora_ack_${id}`, "1");
      } catch {
        // sessionStorage tidak tersedia; overlay disembunyikan untuk sesi ini saja.
      }
      setAckedEventId(id);
      stopAlarm();
    } finally {
      setAcknowledging(false);
    }
  };

  const isAcked = eventId != null && ackedEventId === eventId;
  if (
    !warning ||
    !warning.active ||
    !warning.level ||
    warning.level === "normal" ||
    isAcked
  ) {
    return null;
  }

  const level: AlertLevel = warning.level;
  const sigLevel = warning.sig_level ?? 0;
  const sigRoman =
    sigLevel >= 1 && sigLevel <= 5 ? SIG_ROMAN[sigLevel] : SIG_ROMAN[0];

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={`Peringatan ${LEVEL_LABEL[level]}`}
      className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto p-4"
      style={{ backgroundColor: LEVEL_BG[level], color: "#111827" }}
    >
      <div className="w-full max-w-3xl py-8 text-center">
        <p className="text-sm font-bold tracking-[0.3em] uppercase">
          Peringatan Dini Gempa — SIPAT
        </p>
        <h1 className="mt-4 text-7xl font-black tracking-tight md:text-8xl">
          {LEVEL_LABEL[level]}
        </h1>

        <div className="mt-6 space-y-1 text-lg font-semibold">
          <p>{warning.location_name ?? "Lokasi tidak diketahui"}</p>
          <p className="text-base font-medium">
            {warning.device_name ?? warning.device_id ?? "Perangkat tidak diketahui"}
          </p>
          <p className="text-base font-medium">
            Mulai: {formatDateTime(warning.started_at)}
          </p>
        </div>

        <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <div className="rounded-xl bg-black/10 p-3">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
              PGA
            </p>
            <p className="font-mono text-xl font-bold">
              {(warning.pga_gal ?? 0).toFixed(1)} gal
            </p>
          </div>
          <div className="rounded-xl bg-black/10 p-3">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
              SIG-BMKG
            </p>
            <p className="font-mono text-xl font-bold">
              {sigRoman} ({sigLevel}/5)
            </p>
          </div>
          <div className="rounded-xl bg-black/10 p-3">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Klasifikasi
            </p>
            <p className="text-base font-bold">
              {warning.classification
                ? CLASSIFICATION_LABEL[warning.classification]
                : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-black/10 p-3">
            <p className="text-xs font-semibold tracking-wide uppercase opacity-70">
              Kepercayaan
            </p>
            <p className="font-mono text-xl font-bold">
              {warning.confidence != null
                ? `${(warning.confidence * 100).toFixed(0)}%`
                : "—"}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-xl rounded-xl bg-black/10 p-4 text-left">
          <p className="text-xs font-bold tracking-wide uppercase opacity-70">
            Yang harus dilakukan
          </p>
          <p className="mt-1 text-base leading-relaxed font-medium">
            {SAFETY_TEXT[level]}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void acknowledge();
          }}
          disabled={acknowledging}
          className="mt-8 rounded-2xl bg-[#05070B] px-8 py-4 text-lg font-bold text-white shadow-xl transition hover:bg-black disabled:cursor-wait disabled:opacity-60"
        >
          {acknowledging ? "Menyimpan…" : "Saya Mengerti — Tutup Peringatan"}
        </button>

        {level !== "waspada" ? (
          <p className="mt-4 text-sm font-semibold">
            Alarm berbunyi hingga peringatan ini diakui.
          </p>
        ) : null}
        <p className="mt-2 text-xs font-medium opacity-70">
          Data simulasi untuk demo lomba — bukan peringatan resmi BMKG.
        </p>
      </div>
    </div>
  );
}
