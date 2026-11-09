# SEISMORA — AI-Based Earthquake Detection & Early Warning System

**Stage 1 — built 7 Nov 2026, awaiting deploy.** Competition demo web app.
**Simulation only:** no ESP32/MPU6050 hardware is required — a server-side
simulator generates the sensor data. All monitoring, classification, and early
warning features run on simulated data and are demo-ready.

## What it does

- Real-time vibration monitoring (X/Y/Z acceleration charts, live via SSE)
- Signal processing: per-axis gravity removal, filtering, resultant
  acceleration, PGA (gal, SIG-BMKG reference), RMS, dominant frequency (FFT),
  amplitude, duration
- Rule-based AI classifier — **"Seismora AI v1.0 (rule-based demo classifier)"**:
  Normal / Minor Vibration / Anomaly / Potential Seismic Event + confidence
- Early warning, 4 levels: Normal / Waspada / Siaga / Bahaya. The 3 warning
  levels display as a **full-screen overlay** (level + color, location,
  device, time, PGA, safety instructions, acknowledge button) with a sound
  alarm (Web Audio beep) for Siaga/Bahaya. Every warning is logged to history.
- Multi-location: User → Location → Building → Area → Device → Sensor.
  2 roles only: Super Admin (full access) and User (own locations/devices).
- Scenario Control (Super Admin): trigger Normal / Minor Vibration / Anomaly /
  Seismic Event on demand — the live-demo driver.
- History (event detail with snapshot chart), map (Leaflet/OSM), CSV reports,
  profile, user management.

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # optional; defaults work out of the box
npm run dev                   # or: npm run build && npm run start
# open http://localhost:3000
```

First run seeds the SQLite database (`./data/seismora.sqlite` by default,
override with `DB_PATH`):

| Account | Username | Password | Role |
|---------|----------|----------|------|
| Super Admin | `admin` | `admin123` | super_admin |
| Demo User | `demo` | `demo123` | user |

**Change both passwords before any public demo** (Profile → change password,
or Super Admin → Manajemen User → reset). Set a long random `SESSION_SECRET`
in production (see `.env.example`).

Seed demo data: 1 location ("Kampus Demo", Surakarta, -7.5595, 110.8298),
1 building (Gedung A), 1 area (Lantai 1), 1 device (ESP32-001, MPU6050, online).

## Docker

```bash
docker build -t seismora:latest .
docker run -d --name seismora -p 3000:3000 \
  -v seismora-data:/data \
  -e SESSION_SECRET='<long-random-string>' \
  seismora:latest
```

Requires **node:24-alpine** (the image uses it) because `node:sqlite` does not
exist in Node 20. The SQLite file lives in the `/data` volume; delete the
volume to re-seed from scratch.

## Architecture

```
Browser ── SSE /api/stream (1 msg/s, 10 samples) ──► Simulator (in-memory,
   ▲                                                          100 Hz internal,
   │                                                          4 scenarios)
   │ REST /api/* (auth, CRUD, events, scenario, warnings, dashboard)
   ▼
Next.js 16 App Router (src/app) ── lib/db (node:sqlite) ── data/seismora.sqlite
   ├─ lib/signal: gravity removal, filter, PGA/RMS/FFT, classifier
   ├─ lib/simulator: scenario state machine + event open/close + snapshots
   └─ lib/auth: bcryptjs + httpOnly cookie sessions (7 days)
```

- **Auth:** cookie sessions stored in the `sessions` table; role checks run in
  every API route, not just by hiding menus.
- **Real-time:** Server-Sent Events (not WebSocket) — 1 message/second, each
  carrying the latest 10 samples + computed metrics. The simulator ticks at
  100 Hz internally (10 Hz telemetry); the buffer holds the last 60 s.
- **Events:** when the warning level rises above Normal, an event row opens;
  it closes (with `ended_at` + `snapshot_json`, ≤120 points) after the warning
  has been Normal for >5 s. Warnings are never deletable by User.
- **Map:** Leaflet + OpenStreetMap, SSR-off, divIcon markers.

## Classifier rules (transparent, rule-based — no ML model in Stage 1)

Input: PGA (gal), RMS, sustained duration. Thresholds from the SIG-BMKG
reference table (PGA in gal: <2.9 = I, 2.9–88 = II, 89–167 = III,
168–564 = IV, >564 = V).

| PGA (gal) | Sustained | Classification | Warning |
|-----------|-----------|----------------|---------|
| < 2.9 | — | Normal | Normal |
| 2.9 – 30 | — | Minor Vibration | Normal |
| 30 – 89 | — | Anomaly | Waspada |
| 89 – 168 | ≥ 2 s | Potential Seismic Event | Siaga |
| ≥ 168 | ≥ 2 s | Potential Seismic Event | Bahaya |

A seismic-range spike lasting <2 s is classified Anomaly/Waspada (this avoids
false alarms from single spikes). Confidence is a fixed-range score per band
(0.75–0.98), **not a probability of an earthquake**. The full rules live in
`src/lib/signal.ts` with comments.

## Honesty notes (show these on the demo slides)

- MPU6050 is a **prototype-grade** MEMS sensor, not a professional seismic
  instrument. Stage 1 uses a simulator, not real hardware.
- **PGA is not magnitude.** The SIG-BMKG table is a reference for interpreting
  shaking intensity, not a universal alarm threshold.
- **AI confidence is not earthquake probability.** The classifier detects
  anomalous vibration patterns; it does not predict earthquakes.
- One sensor is **not** an earthquake prediction system. Honest claim:
  "real-time vibration monitoring + anomaly detection".

## Verified (7 Nov 2026, ~16:15 WIB, production build, throwaway DB)

- `npx tsc --noEmit`: 0 errors. `npm run build`: success (23 pages).
- Live check script, **30/30 passed**: root redirect, login page, wrong
  password 401, admin + demo login, `/api/auth/me`, dashboard totals
  (admin 2 users / demo scoped to 1), all 12 app pages 200 as admin, SSE
  6 ticks in ~5 s, seismic scenario → warning **bahaya, 176.76 gal, SIG IV,
  confidence 0.9**, event recorded with peak PGA 191.92 gal, CSV export,
  demo user scenario POST 403, logout → 401.
- Event close verified: `ended_at` + `snapshot_json` (seismic wave visible
  in samples, peak resultant ≈1.8 m/s²). Acknowledge flow verified
  (first 200, second 400 already-acknowledged).
- **Not verified:** the Docker image build (no Docker on the build VM —
  build it on the deploy host first); the full-screen overlay + sound in a
  real browser (needs a browser session — the overlay polls
  `/api/warnings/current` every 2 s and was code-reviewed, not click-tested);
  the Leaflet map tiles at runtime (needs network to OSM tile servers).

## Known limitations / Stage 2

- Only the demo device (ESP32-001) streams simulated data; other devices show
  as offline (no simulator data).
- No real MQTT ingestion yet (Stage 2: Mosquitto + ESP32 firmware).
- No ML model yet (Stage 2: Random Forest / Isolation Forest trained on
  simulator + real shake data; 1D CNN/LSTM only with a labelled dataset).
- Reports are CSV only (PDF/Excel in Stage 2). No audit log or system
  settings pages yet (Stage 2). Notification preferences are localStorage-only.
- The simulator is in-memory: restarting the server resets the scenario to
  Normal (events already written to SQLite persist).

## Project docs

- `RENCANA-DEMO-LOMBA.md` — competition demo plan (MVP scope, timeline,
  risks, honesty rules).
- `CONTRACT.md` — build contract (types, API shapes, file ownership,
  as-built signal pipeline notes).
