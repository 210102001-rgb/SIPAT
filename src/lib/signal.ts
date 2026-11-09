// SEISMORA — pemrosesan sinyal & klasifikasi (Stage 1, SIMULASI SAJA).
//
// Klasifikasi: "SIPAT AI v1.0 — rule-based demo classifier".
// Ini BUKAN model machine learning — melainkan pengklasifikasi berbasis aturan
// (rule-based) di atas PGA / RMS / durasi, untuk keperluan demo lomba.
// Ambang mengacu pada skala intensitas SIG-BMKG (PGA dalam gal).
import type { Classification, Metrics, WarningLevel } from "./types";

/** Nama resmi pengklasifikasi — tampilkan label ini di mana pun nama
 *  pengklasifikasi muncul di UI (bukan sekadar "AI"). */
export const CLASSIFIER_LABEL = "SIPAT AI v1.0 — rule-based demo classifier";

/** Skala intensitas SIG-BMKG dari PGA (gal):
 *  < 2.9 → I, 2.9–88 → II, 89–167 → III, 168–564 → IV, > 564 → V. */
export function SIG_BMKG_LEVEL(pgaGal: number): 1 | 2 | 3 | 4 | 5 {
  if (pgaGal < 2.9) return 1;
  if (pgaGal < 89) return 2;
  if (pgaGal < 168) return 3;
  if (pgaGal <= 564) return 4;
  return 5;
}

export interface ClassifyResult {
  classification: Classification;
  confidence: number;
  warning: WarningLevel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Aturan klasifikasi "SIPAT AI v1.0" (rule-based demo classifier):
 * - pga < 2.9 gal                    → normal   / conf 0.90–0.98 / warning normal
 * - 2.9 ≤ pga < 30 gal               → minor    / conf 0.75–0.88 / warning normal
 * - 30 ≤ pga < 89 gal                → anomaly  / conf 0.78–0.90 / warning waspada
 * - 89 ≤ pga < 168 gal, tahan ≥ 2 dtk → seismic / conf 0.80–0.92 / warning siaga
 * - pga ≥ 168 gal, tahan ≥ 2 dtk      → seismic / conf 0.85–0.94 / warning bahaya
 * - Lonjakan pada rentang seismik yang bertahan < 2 detik dianggap
 *   anomaly / waspada (bukan seismic) untuk menghindari alarm palsu.
 * `durationS` = lama sinyal bertahan di atas 0.3 m/s² di jendela yang sama.
 * `rms` dipakai untuk memodulasi confidence secara deterministik di dalam
 * rentang band-nya (bukan untuk mengubah kelas).
 */
export function classify(pgaGal: number, rms: number, durationS: number): ClassifyResult {
  let classification: Classification;
  let warning: WarningLevel;
  let confMin: number;
  let confMax: number;

  if (pgaGal < 2.9) {
    classification = "normal";
    warning = "normal";
    confMin = 0.9;
    confMax = 0.98;
  } else if (pgaGal < 30) {
    classification = "minor";
    warning = "normal";
    confMin = 0.75;
    confMax = 0.88;
  } else if (pgaGal < 89) {
    classification = "anomaly";
    warning = "waspada";
    confMin = 0.78;
    confMax = 0.9;
  } else if (durationS >= 2) {
    classification = "seismic";
    if (pgaGal >= 168) {
      warning = "bahaya";
      confMin = 0.85;
      confMax = 0.94;
    } else {
      warning = "siaga";
      confMin = 0.8;
      confMax = 0.92;
    }
  } else {
    // Lonjakan seismik sesaat (< 2 detik): anomaly / waspada, anti alarm palsu.
    classification = "anomaly";
    warning = "waspada";
    confMin = 0.78;
    confMax = 0.9;
  }

  // Modulasi confidence deterministik di dalam rentang band: rasio RMS
  // terhadap puncak menggeser confidence sedikit dari tengah band.
  const peakMs2 = Math.max(pgaGal / 100, 0.05);
  const rmsFactor = clamp(rms / peakMs2, 0, 1);
  const mid = (confMin + confMax) / 2;
  const confidence = clamp(mid + (rmsFactor - 0.5) * 0.04, confMin, confMax);
  return { classification, confidence: Math.round(confidence * 100) / 100, warning };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface DftTable {
  freqs: number[];
  cos: Float64Array[];
  sin: Float64Array[];
}

const dftTableCache = new Map<string, DftTable>();

/** Tabel cos/sin DFT untuk kandidat 0.5–20 Hz (langkah 0.5 Hz). */
function getDftTable(sampleRateHz: number, n: number): DftTable {
  const key = `${sampleRateHz}:${n}`;
  const cached = dftTableCache.get(key);
  if (cached) return cached;
  const freqs: number[] = [];
  for (let f = 0.5; f <= 20.0001; f += 0.5) freqs.push(Math.round(f * 10) / 10);
  const cos: Float64Array[] = [];
  const sin: Float64Array[] = [];
  for (const f of freqs) {
    const cosRow = new Float64Array(n);
    const sinRow = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * f * i) / sampleRateHz;
      cosRow[i] = Math.cos(angle);
      sinRow[i] = Math.sin(angle);
    }
    cos.push(cosRow);
    sin.push(sinRow);
  }
  const table: DftTable = { freqs, cos, sin };
  dftTableCache.set(key, table);
  return table;
}

/**
 * Olah satu jendela sampel akselerasi (m/s²) menjadi metrik.
 *
 * Pipeline (penghilangan gravitasi PER SUMBU — lihat catatan di bawah):
 * - Pusatkan tiap sumbu dengan mengurangkan rolling mean-nya (baseline 2 detik).
 *   Gravitasi adalah vektor konstan, jadi ia dihilangkan per sumbu — inilah
 *   arti standar "gravity removal" pada akselerometer. Mean dihitung dari
 *   sinyal yang DI-CLIP ke ±0.5 m/s² (Winsorized): lonjakan unipolar
 *   (spike anomaly 1–3 m/s²) tidak boleh terserap ke baseline — kalau
 *   terserap, setelah spike berakhir baseline yang membengkak itu
 *   menghasilkan undershoot ~1 detik di atas ambang, dan durasi spike
 *   terukur > 2 detik → false bahaya (teramati 2× dalam 60 detik uji
 *   anomaly sebelum perbaikan ini). Osilasi zero-mean (seismik, bump
 *   minor) tidak terpengaruh clipping karena mean-nya ≈ 0.
 * - Filter moving-average 5 tap per sumbu.
 * - Resultan r = sqrt(x² + y² + z²) dari sumbu yang sudah dipusatkan/difilter.
 * - PGA = max r × 100 → gal; RMS dari r; amp = max r.
 * - Frekuensi dominan via DFT naif atas kandidat 0.5–20 Hz (langkah 0.5 Hz)
 *   pada ketiga sumbu yang sudah dipusatkan/difilter (diambil magnitudo
 *   terbesar lintas sumbu); jendela ≤ 200 titik sehingga DFT naif cukup cepat.
 * - duration_s = lama sinyal r bertahan di atas 0.3 m/s² — diukur sebagai
 *   run terpanjang di atas ambang, dengan celah ≤ 0.1 detik dijembatani.
 *   Penjembatanan diperlukan karena osilasi seismik murni (sinus) turun di
 *   bawah ambang sesaat di tiap perlintasan nol (~10–25 ms) — tanpa itu,
 *   durasi seismik sejati akan terukur ~0.15 detik. Celah > 0.1 detik
 *   memutus run, sehingga lonjakan tajam yang terpisah (anomaly) tidak
 *   pernah terhitung "tahan ≥ 2 detik" dan tidak memicu alarm palsu.
 *   (Total mentah di atas ambang TIDAK dipakai: ekor undershoot dari
 *   rolling-mean baseline setelah lonjakan besar + dua lonjakan dalam
 *   satu jendela dapat menjumlah > 2 detik — teramati sebagai false
 *   bahaya pada skenario anomaly sebelum perbaikan ini.)
 *
 * CATATAN PENYIMPANGAN DARI KONTRAK: CONTRACT.md menulis "gravity removal =
 * subtract rolling mean of r" (rolling mean dari resultan). Itu TIDAK dipakai,
 * karena resultan selalu positif — mengurangkan mean-nya dari dirinya sendiri
 * akan merektifikasi osilasi (r ≈ |sinus|) dan menghancurkan amplitudo:
 * osilasi seismik 1.8 m/s² terukur hanya ~0.44 m/s² (≈44 gal, anomaly/waspada)
 * dan TIDAK PERNAH mencapai siaga/bahaya — bertentangan dengan klaim kontrak
 * sendiri ("Peak resultant ≈ 1.8 m/s² ≈ 180 gal → bahaya"). Penghilangan
 * gravitasi per sumbu mempertahankan amplitudo dan memenuhi klaim tersebut.
 */
export function processWindow(
  samples: Array<{ x: number; y: number; z: number }>,
  sampleRateHz: number,
): Omit<Metrics, "classification" | "confidence" | "warning"> {
  const zero = {
    pga_gal: 0,
    sig_level: 1,
    rms: 0,
    freq_hz: 0,
    amp_ms2: 0,
    duration_s: 0,
  };
  if (samples.length === 0 || sampleRateHz <= 0) return zero;

  const n = samples.length;
  const baselineLen = Math.max(1, Math.round(2 * sampleRateHz));

  // 1) Pusatkan tiap sumbu (rolling mean trailing, baseline 2 detik),
  //    lalu 2) moving-average 5 tap per sumbu.
  const axes: Array<Array<number>> = [
    samples.map((s) => s.x),
    samples.map((s) => s.y),
    samples.map((s) => s.z),
  ];
  const filteredAxes: Array<Array<number>> = axes.map((axis) => {
    const centered: number[] = new Array<number>(n);
    // Rolling mean trailing (baseline 2 detik) dari sinyal ter-clip ±0.5 —
    // lihat catatan di header: mencegah spike unipolar terserap baseline.
    const clip = (v: number): number => Math.min(0.5, Math.max(-0.5, v));
    let windowSum = 0;
    for (let i = 0; i < n; i++) {
      windowSum += clip(axis[i]);
      if (i >= baselineLen) windowSum -= clip(axis[i - baselineLen]);
      centered[i] = axis[i] - windowSum / Math.min(i + 1, baselineLen);
    }
    const filtered: number[] = new Array<number>(n);
    let maSum = 0;
    for (let i = 0; i < n; i++) {
      maSum += centered[i];
      if (i >= 5) maSum -= centered[i - 5];
      filtered[i] = maSum / Math.min(i + 1, 5);
    }
    return filtered;
  });

  // 3) Resultan dari sumbu yang sudah dipusatkan/difilter.
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const xf = filteredAxes[0][i];
    const yf = filteredAxes[1][i];
    const zf = filteredAxes[2][i];
    const r = Math.sqrt(xf * xf + yf * yf + zf * zf);
    if (r > peak) peak = r;
    sumSq += r * r;
  }
  const rms = Math.sqrt(sumSq / n);
  const pgaGal = peak * 100;

  // Durasi: run terpanjang di atas 0.3 m/s², celah ≤ 0.1 detik dijembatani
  // (perlintasan nol osilasi). Lihat catatan di header fungsi.
  const bridgeSamples = Math.max(1, Math.round(0.1 * sampleRateHz));
  let maxRun = 0;
  let runStart = -1;
  let lastAbove = -1;
  for (let i = 0; i < n; i++) {
    const xf = filteredAxes[0][i];
    const yf = filteredAxes[1][i];
    const zf = filteredAxes[2][i];
    const r = Math.sqrt(xf * xf + yf * yf + zf * zf);
    if (r > 0.3) {
      if (runStart === -1) runStart = i;
      lastAbove = i;
    } else if (runStart !== -1 && i - lastAbove > bridgeSamples) {
      if (lastAbove - runStart + 1 > maxRun) maxRun = lastAbove - runStart + 1;
      runStart = -1;
      lastAbove = -1;
    }
  }
  if (runStart !== -1 && lastAbove - runStart + 1 > maxRun) {
    maxRun = lastAbove - runStart + 1;
  }
  const durationS = maxRun / sampleRateHz;

  // 4) Frekuensi dominan: DFT naif atas kandidat 0.5–20 Hz, langkah 0.5 Hz,
  //    dihitung per sumbu (terfilter) dan diambil magnitudo terbesar.
  //    (DFT pada resultan akan menggandakan frekuensi karena |sinus|.)
  //    Tabel cos/sin di-cache per (sampleRateHz, panjang jendela) agar
  //    tick 100 ms tetap murah pada jendela 500 titik.
  let bestFreq = 0;
  let bestMag = 0;
  if (peak > 0) {
    const table = getDftTable(sampleRateHz, n);
    for (let fi = 0; fi < table.freqs.length; fi++) {
      const cosRow = table.cos[fi];
      const sinRow = table.sin[fi];
      for (let a = 0; a < 3; a++) {
        const axis = filteredAxes[a];
        let re = 0;
        let im = 0;
        for (let i = 0; i < n; i++) {
          re += axis[i] * cosRow[i];
          im -= axis[i] * sinRow[i];
        }
        const mag = Math.sqrt(re * re + im * im);
        if (mag > bestMag) {
          bestMag = mag;
          bestFreq = table.freqs[fi];
        }
      }
    }
  }

  return {
    pga_gal: round2(pgaGal),
    sig_level: SIG_BMKG_LEVEL(pgaGal),
    rms: round2(rms),
    freq_hz: bestFreq,
    amp_ms2: round2(peak),
    duration_s: round2(durationS),
  };
}

/** Instruksi keselamatan berbahasa Indonesia per level peringatan. */
export const SAFETY_TEXT: Record<WarningLevel, string> = {
  normal:
    "Kondisi normal. Tetap waspada, kenali jalur evakuasi terdekat, dan pastikan tas darurat mudah dijangkau.",
  waspada:
    "Tetap tenang. Jauhi benda yang dapat jatuh, siapkan tas darurat, dan pantau informasi resmi dari BMKG atau petugas.",
  siaga:
    "Segera berlindung di bawah meja yang kokoh atau di sudut ruangan. Jauhi jendela dan benda berat. Bersiap untuk evakuasi.",
  bahaya:
    "SEGERA EVAKUASI ke titik kumpul di area terbuka. Jangan gunakan lift. Lindungi kepala. Ikuti arahan petugas.",
};
