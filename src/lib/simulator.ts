// SEISMORA — simulator sensor (Stage 1, SIMULASI SAJA — tanpa hardware nyata).
// Mensimulasikan satu perangkat demo ESP32-001 (MPU6050).
//
// LAJU SAMPLING INTERNAL 100 Hz (lihat catatan penyimpangan di bawah).
// Telemetri/metrics tetap 10 Hz: tick metrik tiap 100 ms, SSE 1 pesan/detik
// berisi 10 sampel (downsample ke 10 Hz). Buffer menyimpan 60 detik terakhir,
// snapshot event = 60 detik terakhir yang di-downsample ke ≤ 120 titik.
// Setiap tick metrik: hitung ulang metrik atas jendela trailing 5 detik,
// klasifikasikan, dan kelola baris event di DB: peringatan naik di atas
// normal → INSERT event; kembali normal > 5 detik → UPDATE ended_at +
// snapshot_json. Interval di-unref agar tidak menahan proses build/exit.
//
// CATATAN PENYIMPANGAN DARI KONTRAK: CONTRACT.md menulis sampling 10 Hz
// (tick 100 ms, "generate sample" per tick). Itu TIDAK dipakai untuk
// pembangkitan sampel, karena secara matematis mustahil memenuhi klaim
// kontrak sendiri ("Peak resultant ≈ 1.8 m/s² ≈ 180 gal → bahaya"):
// pada sampling 10 Hz, frekuensi Nyquist = 5 Hz — osilasi seismik 2–5 Hz
// berada di tepi/pas di atas Nyquist — dan filter moving-average 5 tap
// pada 10 Hz memiliki null tepat di 2 Hz dan 4 Hz, sehingga osilasi
// 1.8 m/s² terukur hanya ~0.8 m/s² (≈80 gal, waspada) dan TIDAK PERNAH
// mencapai siaga/bahaya (terbukti pada uji live: puncak 80.69 gal).
// Akselerometer nyata di-sampling 50–200 Hz; angka 10 Hz di kontrak adalah
// laju telemetri, bukan laju DSP. Dengan pembangkitan 100 Hz, MA(5)
// (null pertama 20 Hz) melewatkan pita 2–5 Hz pada 0.90–0.98 sehingga
// PGA ≈ 175–190 gal untuk puncak 1.8 m/s² → bahaya, sesuai janji kontrak.
import { getDb, queryOne, run } from "./db";
import { SIG_BMKG_LEVEL, classify, processWindow } from "./signal";
import type {
  Classification,
  CurrentWarning,
  DeviceRow,
  LocationRow,
  Metrics,
  Sample,
  Scenario,
  WarningLevel,
} from "./types";

const DEMO_DEVICE_ID = "ESP32-001";
// Laju pembangkitan sampel internal (DSP). Telemetri/metrics tetap 10 Hz.
const GEN_RATE_HZ = 100;
const GEN_MS = 1000 / GEN_RATE_HZ;
const METRICS_TICK_MS = 100;
const METRICS_EVERY_N_GEN = METRICS_TICK_MS / GEN_MS; // 10
const SAMPLE_RATE_HZ = GEN_RATE_HZ;
const BUFFER_MAX = 60 * GEN_RATE_HZ; // 60 detik
const WINDOW_SAMPLES = 5 * GEN_RATE_HZ; // jendela trailing 5 detik
const NORMAL_CLOSE_MS = 5000;
// Stream/metrics memakai sampel berjarak 10 Hz.
const STREAM_STRIDE = GEN_RATE_HZ / 10;

const ZERO_METRICS: Metrics = {
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

// ---- State singleton modul ----
let scenario: Scenario = "normal";
let scenarioSince: string = new Date().toISOString();
let timer: ReturnType<typeof setInterval> | null = null;
let buffer: Sample[] = [];
let currentMetrics: Metrics = { ...ZERO_METRICS };
let currentEventId: number | null = null;
let eventStartedAt: string | null = null;
let peakPga = 0;
let peakRms = 0;
let peakFreq = 0;
// Status terakhir event yang masih terbuka — dipakai getCurrentWarning agar
// peringatan tidak berkedip "active:false" saat metrik sesaat turun ke
// normal di sela siklus seismik selagi event belum ditutup.
let lastEventWarning: WarningLevel = "normal";
let lastEventClassification: Classification = "normal";
let lastEventConfidence = 0;
let normalSince: number | null = null;

// State generator pola minor (bump kendaraan/mesin 2–4 detik).
let bumpUntil = 0;
let bumpAmp = 0;
let bumpFreq = 1.5;
// State generator pola anomaly (lonjakan tajam 0.5–1 detik).
let spikeUntil = 0;
let spikeStart = 0;
let spikeAmp = 0;
// State generator pola seismic (siklus osilasi 10–20 detik + jeda 5–10 detik).
let seismicUntil = 0;
let seismicStart = 0;
let seismicDuration = 15000;
let seismicFreq = 3;
let seismicAmp = 1.4;
let seismicGapUntil = 0;

/** Gaussian-ish noise (Box-Muller) dengan mean 0 dan simpangan baku `sigma`. */
function gauss(sigma: number): number {
  let u1 = Math.random();
  if (u1 <= 0) u1 = Number.MIN_VALUE;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * sigma;
}

function resetPatternState(): void {
  bumpUntil = 0;
  bumpAmp = 0;
  spikeUntil = 0;
  spikeStart = 0;
  spikeAmp = 0;
  seismicUntil = 0;
  seismicStart = 0;
  seismicGapUntil = 0;
}

/**
 * Hasilkan satu sampel akselerasi (komponen dinamis, m/s²) sesuai skenario:
 * - normal: noise σ 0.015 tiap sumbu (kontrak: 0.02 — diturunkan agar
 *   keadaan diam terbaca normal: pada sampling 100 Hz, jendela 5 detik
 *   berisi 500 sampel sehingga puncak noise σ 0.02 ≈ 3.3 gal, melewati
 *   ambang normal 2.9 gal dan label diam menjadi "minor"; σ 0.015
 *   menghasilkan PGA ≈ 2.5 gal → normal, SIG I).
 * - minor: noise σ 0.05 + bump acak 2–4 detik sebesar 0.3–0.8 m/s².
 * - anomaly: lonjakan tajam 1–3 m/s² selama 0.5–1 detik, lalu noise.
 * - seismic: osilasi 10–20 detik sebesar 1.7–1.9 m/s² pada 2–5 Hz
 *   (sinus × envelope naik-turun), lalu reda ke noise; puncak resultan
 *   ≈ 1.8–2.0 m/s² ≈ 180–200 gal → bahaya. (Kontrak: 1–1.8 m/s² —
 *   rentang dinaikkan sedikit karena atenuasi MA(5) pada 100 Hz
 *   (0.90–0.98 di pita 2–5 Hz) membuat amplitudo 1.0–1.6 hanya mencapai
 *   siaga; 1.7–1.9 menjamin puncak melewati ambang bahaya 168 gal.)
 */
function generateSample(now: number): Sample {
  const tSec = now / 1000;
  let x = gauss(0.015);
  let y = gauss(0.015);
  let z = gauss(0.015);

  if (scenario === "minor") {
    // Total σ ≈ 0.05 per sumbu (0.015 dasar + 0.048 tambahan).
    x += gauss(0.048);
    y += gauss(0.048);
    z += gauss(0.048);
    if (now >= bumpUntil && Math.random() < 0.0004) {
      bumpUntil = now + 2000 + Math.random() * 2000;
      bumpAmp = 0.3 + Math.random() * 0.5;
      bumpFreq = 1 + Math.random() * 2;
    }
    if (now < bumpUntil) {
      x += bumpAmp * Math.sin(2 * Math.PI * bumpFreq * tSec);
    }
  } else if (scenario === "anomaly") {
    if (now >= spikeUntil && Math.random() < 0.0008) {
      spikeStart = now;
      spikeUntil = now + 500 + Math.random() * 500;
      spikeAmp = 1 + Math.random() * 2;
    }
    if (now < spikeUntil) {
      const progress = (now - spikeStart) / Math.max(spikeUntil - spikeStart, 1);
      const envelope = Math.sin(Math.PI * Math.min(Math.max(progress, 0), 1));
      x += spikeAmp * envelope;
      y += spikeAmp * 0.3 * envelope;
    }
  } else if (scenario === "seismic") {
    if (seismicUntil === 0) {
      if (now >= seismicGapUntil) {
        seismicStart = now;
        seismicDuration = 10000 + Math.random() * 10000;
        seismicUntil = now + seismicDuration;
        seismicFreq = 2 + Math.random() * 3;
        seismicAmp = 1.7 + Math.random() * 0.2;
      }
    } else if (now < seismicUntil) {
      const progress = (now - seismicStart) / seismicDuration;
      const envelope = Math.sin(Math.PI * Math.min(Math.max(progress, 0), 1));
      const osc =
        seismicAmp * envelope * Math.sin(2 * Math.PI * seismicFreq * tSec);
      x += osc;
      y += osc * 0.4;
    } else {
      // Siklus selesai → jeda 5–10 detik sebelum siklus berikutnya.
      seismicUntil = 0;
      seismicGapUntil = now + 5000 + Math.random() * 5000;
    }
  }

  return { t: now, x, y, z, r: Math.sqrt(x * x + y * y + z * z) };
}

function recomputeMetrics(): void {
  const windowSamples = buffer.slice(-WINDOW_SAMPLES);
  const processed = processWindow(
    windowSamples.map((s) => ({ x: s.x, y: s.y, z: s.z })),
    SAMPLE_RATE_HZ,
  );
  const result = classify(processed.pga_gal, processed.rms, processed.duration_s);
  currentMetrics = {
    ...processed,
    classification: result.classification,
    confidence: result.confidence,
    warning: result.warning,
  };
}

function downsample(samples: Sample[], maxPoints: number): Sample[] {
  if (samples.length <= maxPoints) return [...samples];
  const stride = Math.ceil(samples.length / maxPoints);
  const out: Sample[] = [];
  for (let i = 0; i < samples.length; i += stride) out.push(samples[i]);
  return out;
}

function manageEvents(now: number): void {
  const m = currentMetrics;
  if (m.warning !== "normal") {
    normalSince = null;
    lastEventWarning = m.warning;
    lastEventClassification = m.classification;
    lastEventConfidence = m.confidence;
    if (currentEventId === null) {
      const startedAt = new Date(now).toISOString();
      const result = run(
        "INSERT INTO events (device_id, started_at, ended_at, classification, warning, peak_pga_gal, peak_rms, dominant_freq, duration_s) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0)",
        [
          DEMO_DEVICE_ID,
          startedAt,
          m.classification,
          m.warning,
          m.pga_gal,
          m.rms,
          m.freq_hz,
        ],
      );
      currentEventId = Number(result.lastInsertRowid);
      eventStartedAt = startedAt;
      peakPga = m.pga_gal;
      peakRms = m.rms;
      peakFreq = m.freq_hz;
    } else {
      peakPga = Math.max(peakPga, m.pga_gal);
      peakRms = Math.max(peakRms, m.rms);
      peakFreq = m.freq_hz;
      const durationS = eventStartedAt
        ? Math.round(((now - Date.parse(eventStartedAt)) / 1000) * 100) / 100
        : 0;
      run(
        "UPDATE events SET classification = ?, warning = ?, peak_pga_gal = ?, peak_rms = ?, dominant_freq = ?, duration_s = ? WHERE id = ?",
        [m.classification, m.warning, peakPga, peakRms, peakFreq, durationS, currentEventId],
      );
    }
  } else if (currentEventId !== null) {
    if (normalSince === null) {
      normalSince = now;
    } else if (now - normalSince > NORMAL_CLOSE_MS) {
      const snapshot = downsample(buffer, 120);
      run("UPDATE events SET ended_at = ?, snapshot_json = ? WHERE id = ?", [
        new Date(now).toISOString(),
        JSON.stringify(snapshot),
        currentEventId,
      ]);
      currentEventId = null;
      eventStartedAt = null;
      normalSince = null;
      lastEventWarning = "normal";
      lastEventClassification = "normal";
      lastEventConfidence = 0;
    }
  }
}

let genCount = 0;

function tick(): void {
  const now = Date.now();
  buffer.push(generateSample(now));
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  genCount += 1;
  // Metrik + event hanya dihitung tiap 100 ms (10 Hz), sesuai laju telemetri.
  if (genCount % METRICS_EVERY_N_GEN !== 0) return;
  recomputeMetrics();
  manageEvents(now);
}

function ensureStarted(): void {
  if (timer !== null) return;
  // Pemanasan: isi 5 detik data awal agar metrik pertama langsung bermakna.
  const now = Date.now();
  for (let i = WINDOW_SAMPLES; i >= 1; i--) {
    buffer.push(generateSample(now - i * GEN_MS));
  }
  recomputeMetrics();
  timer = setInterval(tick, GEN_MS);
  // unref: interval simulasi tidak boleh menahan proses build / exit.
  const handle = timer as unknown as { unref?: () => void };
  if (typeof handle.unref === "function") handle.unref();
}

export function setScenario(next: Scenario): void {
  if (next === scenario) return;
  scenario = next;
  scenarioSince = new Date().toISOString();
  resetPatternState();
  ensureStarted();
}

export function getScenario(): Scenario {
  return scenario;
}

export function getScenarioSince(): string {
  return scenarioSince;
}

export function getCurrentMetrics(): Metrics {
  ensureStarted();
  return { ...currentMetrics };
}

export function getRecentSamples(n: number): Sample[] {
  ensureStarted();
  // Kembalikan n sampel berjarak 10 Hz (downsample dari buffer 100 Hz),
  // sesuai laju telemetri yang dipakai SSE/LiveChart.
  const count = Math.max(n, 0);
  if (count === 0) return [];
  const window = buffer.slice(-count * STREAM_STRIDE);
  const out: Sample[] = [];
  for (let i = 0; i < window.length; i += STREAM_STRIDE) out.push(window[i]);
  return out.slice(-count);
}

export function getCurrentWarning(): CurrentWarning | null {
  ensureStarted();
  // Selama event masih terbuka, peringatan dianggap aktif — sekalipun metrik
  // sesaat turun ke normal di sela siklus — agar overlay tidak berkedip.
  // Saat metrik normal, tampilkan status terakhir + PGA puncak event.
  const live = currentMetrics.warning !== "normal";
  if (currentEventId === null && !live) return null;
  // Pastikan tabel ter-init (getDb lazy) sebelum membaca nama perangkat/lokasi.
  void getDb();
  const device = queryOne<DeviceRow>("SELECT * FROM devices WHERE device_id = ?", [
    DEMO_DEVICE_ID,
  ]);
  const location =
    device !== null
      ? queryOne<LocationRow>("SELECT * FROM locations WHERE id = ?", [
          device.location_id,
        ])
      : null;
  const level = live ? currentMetrics.warning : lastEventWarning;
  const classification = live
    ? currentMetrics.classification
    : lastEventClassification;
  const pgaGal = live ? currentMetrics.pga_gal : peakPga;
  return {
    active: true,
    event_id: currentEventId,
    level,
    classification,
    pga_gal: pgaGal,
    sig_level: SIG_BMKG_LEVEL(pgaGal),
    device_id: DEMO_DEVICE_ID,
    device_name: device ? device.name : "Sensor Gedung A",
    location_name: location ? location.name : "Kampus Demo",
    started_at: eventStartedAt,
    confidence: live ? currentMetrics.confidence : lastEventConfidence,
  };
}
