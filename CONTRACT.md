# SEISMORA Stage 1 — BUILD CONTRACT (read this FIRST, all agents)

Single source of truth for integration. If this file and the task brief disagree,
this file wins on file ownership and API shapes; the brief wins on product scope.

## Stack (already installed in ~/workspace/seismora/)
- Next.js 16.4.5 (App Router, src/), React 19.3, TypeScript 5, Tailwind CSS v4
  (CSS-first config: `@import "tailwindcss"` + `@theme` in `src/app/globals.css`).
- Deps added: recharts, leaflet, react-leaflet, bcryptjs (+ @types/leaflet, @types/bcryptjs).
- DB: `node:sqlite` (Node 24 — works, verified). NO external MySQL.
- Node 24.22.1 / npm 10.9.4 locally. **Dockerfile must use node:24-alpine**
  (the brief said node:20-alpine, but `node:sqlite` does not exist in Node 20).
- UI language: Indonesian labels, English technical terms where standard
  (PGA, RMS, FFT, MQTT). Dark "control room" theme — NOT warm paper.
- NO `any` in shipped code. NO placeholder TODOs in shipped paths.
- Every API route returns the envelope `{ ok: true, data }` or
  `{ ok: false, error }`. Auth failure → HTTP 401 `{ ok:false, error:"unauthorized" }`.
  Admin-only failure → HTTP 403 `{ ok:false, error:"forbidden" }`.

## Design tokens (Tailwind v4 @theme in globals.css — Agent C owns this file)
- bg: #05070B page, #0B0F16 panel, #10151F panel-2, border #1E293B
- text: #F1F5F9 primary, #94A3B8 muted
- accents: green #22C55E, yellow #EAB308, orange #F97316, red #EF4444,
  cyan #22D3EE (data), blue #3B82F6 (links/actions)
- font: Inter via next/font/google; numbers in `font-mono` (ui-monospace).
- Warning level → color: normal=green, waspada=yellow, siaga=orange, bahaya=red.

## Next 16 notes (verified from node_modules/next/dist/docs/)
- `cookies()` is ASYNC: `const cookieStore = await cookies()` (next/headers).
- Dynamic route `params` is a Promise: `const { id } = await params`.
- Route groups `(app)` are fine. `redirect()` from next/navigation in server components.
- `cacheComponents: true` is INCOMPATIBLE with `export const dynamic =
  "force-dynamic"` (hard runtime 500 on every route — found live 7 Nov 2026).
  It is OFF in next.config.ts; do not re-enable it.

## Shared types (src/lib/types.ts — Agent A owns this file, others import it)
```ts
export type Role = "super_admin" | "user";
export type WarningLevel = "normal" | "waspada" | "siaga" | "bahaya";
export type Classification = "normal" | "minor" | "anomaly" | "seismic";
export type Scenario = "normal" | "minor" | "anomaly" | "seismic";
export interface SessionUser { id: number; username: string; name: string; role: Role }
export interface UserRow { id: number; username: string; name: string; email: string; role: Role; status: "active" | "disabled"; created_at: string; last_login_at: string | null }
export interface LocationRow { id: number; name: string; type: string; province: string; city: string; district: string; address: string; lat: number; lng: number; photo_url: string; description: string; owner_id: number | null }
export interface BuildingRow { id: number; location_id: number; name: string; code: string; type: string; floors: number; description: string }
export interface AreaRow { id: number; building_id: number; name: string; code: string; floor: number; description: string }
export interface DeviceRow { id: number; device_id: string; name: string; sensor_type: string; location_id: number; building_id: number | null; area_id: number | null; status: "online" | "offline"; interval_ms: number; last_activity_at: string | null }
export interface Sample { t: number; x: number; y: number; z: number; r: number }
export interface Metrics { pga_gal: number; sig_level: number; rms: number; freq_hz: number; amp_ms2: number; duration_s: number; classification: Classification; confidence: number; warning: WarningLevel }
export interface EventRow { id: number; device_id: string; started_at: string; ended_at: string | null; classification: Classification; warning: WarningLevel; peak_pga_gal: number; peak_rms: number; dominant_freq: number; duration_s: number; acknowledged_at: string | null; acknowledged_by: string | null; snapshot_json: string | null }
export interface TickMsg { type: "tick"; device_id: string; samples: Sample[]; metrics: Metrics; scenario: Scenario; at: string }
```

## DB (src/lib/db.ts — Agent A)
- File: `process.env.DB_PATH || <project>/data/seismora.sqlite` (mkdir -p data dir).
- Tables: users, locations, location_users, buildings, areas, devices, events,
  sessions. (events.snapshot_json TEXT nullable; sessions: id TEXT PK, user_id,
  expires_at TEXT.)
- Export: `getDb(): DatabaseSync` (singleton), `initDb()` (CREATE TABLE IF NOT
  EXISTS + seed if users empty), `queryAll<T>(sql, params)`, `queryOne<T>`,
  `run(sql, params)` helpers. Call `initDb()` lazily inside getDb().
- Seed (only when users table empty):
  - admin / admin123 (super_admin, "Administrator", admin@seismora.local)
  - demo / demo123 (user, "Demo User", demo@seismora.local)
  - Location "Kampus Demo" (Kampus, Jawa Tengah, Surakarta, Jebres,
    "Jl. Demo No. 1, Surakarta", lat -7.5595, lng 110.8298, owner = demo user)
  - Building "Gedung A" (GD-A, 3 floors), Area "Lantai 1" (LT-1, floor 1)
  - Device ESP32-001 "Sensor Gedung A", MPU6050, online, interval_ms 100.
  - location_users: demo ↔ Kampus Demo.

## Auth (src/lib/auth.ts — Agent A)
- bcryptjs hash/compare. Cookie name `seismora_session`, httpOnly, sameSite lax,
  path /, maxAge 7d. Session id = crypto.randomUUID, stored in sessions table.
- Exports: `getSession(): Promise<SessionUser | null>` (reads next/headers cookies),
  `createSession(userId: number): Promise<string>`, `destroySession(): Promise<void>`,
  `requireSession(): Promise<SessionUser>` (throws Response 401 — route handlers
  catch and return envelope), `requireAdmin(s: SessionUser)`.
- `canAccessLocation(session, locationId)`: admin → true; else row in location_users.
- `visibleLocationIds(session): number[]` for list filtering.

## Signal processing (src/lib/signal.ts — Agent A)
- `SIG_BMKG_LEVEL(pgaGal): 1|2|3|4|5` — <2.9→1, 2.9–88→2, 89–167→3, 168–564→4, >564→5.
- `classify(pgaGal, rms, durationS): { classification, confidence, warning }`
  — HONEST rule-based classifier "Seismora AI v1.0 (rule-based demo classifier)".
  Rules (document in code comment):
  - pga < 2.9 → normal / conf 0.90–0.98 / warning normal
  - 2.9 ≤ pga < 30 → minor / conf 0.75–0.88 / warning normal
  - 30 ≤ pga < 89 → anomaly / conf 0.78–0.90 / warning waspada
  - 89 ≤ pga < 168 (sustained ≥ 2s) → seismic / conf 0.80–0.92 / warning siaga
  - pga ≥ 168 (sustained ≥ 2s) → seismic / conf 0.85–0.94 / warning bahaya
  - Below 2s sustained, a seismic-range spike is anomaly/waspada (avoid false alarm).
- `processWindow(samples: {x,y,z}[], sampleRateHz): Omit<Metrics,"classification"|"confidence"|"warning">`
  — AS BUILT (Agent A, verified live 7 Nov 2026 — the contract's first draft of
  this pipeline rectified the oscillation and could never reach bahaya, so it
  was corrected): gravity removal is PER-AXIS (subtract per-axis trailing
  baseline mean, values clipped to ±0.5 m/s²); 5-tap moving average; resultant
  r=sqrt(x²+y²+z²); PGA = max |r_filtered| in window ×100 → gal; RMS over window;
  dominant freq via DFT over candidate freqs 0.5–20 Hz step 0.5 (window ≤ 200
  points, naive DFT is fine); amp = max |r_filtered| m/s²; duration_s = LONGEST
  run above 0.3 m/s² with ≤0.1 s gaps bridged (not total time above).
- `SAFETY_TEXT: Record<WarningLevel, string>` — Indonesian safety instructions
  per level (Agent A defines; WarningOverlay uses it).

## Simulator (src/lib/simulator.ts — Agent A)
- Module-level singleton state: `scenario: Scenario` ("normal"), `scenarioSince`,
  sample buffer (last 60 s at 10 Hz), current event id, peak trackers.
- `setScenario(s: Scenario): void`, `getScenario(): Scenario`,
  `getCurrentMetrics(): Metrics`, `getRecentSamples(n): Sample[]`,
  `getCurrentWarning(): { active, event_id, level, classification, pga_gal, sig_level, device_id, device_name, location_name, started_at, confidence } | null`.
- Sample generation (AS BUILT: internal sampling 100 Hz — at 10 Hz Nyquist is
  5 Hz and MA(5) nulls exactly at 2 and 4 Hz, so a 2–5 Hz oscillation could
  never reach bahaya; telemetry/metrics stay 10 Hz, buffer 60 s, snapshot
  ≤120 pts): accel m/s² dynamic component, Gaussian-ish noise via Box-Muller):
  - normal: σ 0.015 each axis.
  - minor: σ ≈ 0.05 total + random 2–4 s bumps of 0.3–0.8 m/s² (vehicle/machine).
  - anomaly: sharp 1–3 m/s² spike 0.5–1 s, then noise.
  - seismic: sustained 10–20 s oscillation 1.7–1.9 m/s² at 2–5 Hz (sine × envelope),
    then decay to noise. Peak resultant ≈ 1.8 m/s² ≈ 180 gal → bahaya.
- A `setInterval` tick (100 ms) started lazily on first import/use (guard
  `if (!timer)`); each tick: generate sample, push to buffer, recompute metrics
  over trailing 5 s window, classify, and manage events in DB: when warning
  rises above normal → INSERT event (started_at now, classification, warning);
  update peak_pga/peak_rms/dominant_freq/duration while open; when warning
  returns to normal for >5 s → UPDATE ended_at + snapshot_json (last 60 s
  samples downsampled to ≤120 points).
- Only device ESP32-001 is simulated. Other devices stay offline (DB status).

## API routes (Agents A and B — exact paths, all enforce auth)
- A: POST /api/auth/login {username,password}; GET /api/auth/me; POST /api/auth/logout
- A: GET /api/scenario → {scenario}; POST /api/scenario {scenario} (admin only)
- A: GET /api/stream?device_id=ESP32-001 (SSE, `export const dynamic="force-dynamic"`,
  1 msg/sec `data: <TickMsg JSON>\n\n`, heartbeat `: ping\n\n` every 15 s)
- A: GET /api/warnings/current → getCurrentWarning() shape or {active:false}
- A: GET /api/dashboard → role-aware summary {totals, recentEvents}
- B: CRUD /api/locations, /api/buildings, /api/areas, /api/devices
  (GET list with ?location_id / ?building_id filters, POST create, GET/PUT/DELETE
  /api/<res>/[id]). Users see only their locations (filter by visibleLocationIds);
  admin sees all. Devices: only admin can create/edit/delete; user read-only.
- B: GET /api/events?device_id&level&from&to (paged, 50/page), GET /api/events/[id]
  (incl. snapshot parsed), POST /api/events/[id]/acknowledge {by}
- B: GET /api/events/export?format=csv (same filters; CSV download)
- B: GET /api/users (admin), POST /api/users (admin), PATCH /api/users/[id] (admin),
  DELETE /api/users/[id] (admin)
- B: GET/PATCH /api/profile, POST /api/profile/password {current,new}
- Route handlers: `export const dynamic = "force-dynamic"` on all API routes.

## Shared components (exact exports — import paths matter)
- Agent C: `src/components/Sidebar.tsx` (default export; props `{ user: SessionUser }`;
  menu by role: admin → Dashboard, Monitoring, Lokasi, Bangunan & Area, Perangkat,
  Kontrol Skenario, Riwayat, Peta, Laporan, Manajemen User, Profil;
  user → Dashboard, Monitoring, Lokasi Saya, Perangkat, Riwayat, Peta, Laporan, Profil.
  Use <a> links, active state via usePathname.)
- Agent C: `src/components/Topbar.tsx` (default; props `{ user: SessionUser }`;
  shows current warning badge + user name + logout button → POST /api/auth/logout).
- Agent C: `src/components/StatCard.tsx` (named export `StatCard`;
  props `{ label: string; value: string; sub?: string; tone?: "green"|"yellow"|"orange"|"red"|"cyan"|"slate" }`).
- Agent C: `src/components/LiveChart.tsx` (named export `LiveChart`;
  props `{ data: Sample[]; height?: number }`; Recharts LineChart, lines x(cyan),
  y(green), z(amber), r(white, thicker); XAxis time HH:mm:ss; no animation
  (`isAnimationActive={false}`); CartesianGrid subtle.)
- Agent D: `src/components/Modal.tsx` (named export `Modal`;
  props `{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }`).
- Agent E: `src/components/WarningOverlay.tsx` (default export, NO props).
  Polls GET /api/warnings/current every 2 s. When active warning (waspada/siaga/
  bahaya) and not acknowledged in sessionStorage for that event id → full-screen
  fixed overlay (z-100), level color bg, big level text, location/device/time/PGA/
  SIG level/classification/confidence, SAFETY_TEXT instructions, "Saya Mengerti /
  Acknowledge" button → POST /api/events/[id]/acknowledge + sessionStorage ack.
  Sound: Web Audio beep (oscillator, 880 Hz, 0.5 s on/off) for siaga/bahaya until
  acknowledged; start on mount attempt, resume on first pointerdown (autoplay rule).
  Must NOT render anything when warning is normal or acknowledged.

## Pages (App Router, under src/app/)
- C: /login (client form → POST /api/auth/login → router.push("/dashboard"));
  root layout (src/app/layout.tsx) = Inter font + globals.css + metadata
  "SEISMORA — Deteksi Gempa & Early Warning".
- C: src/app/(app)/layout.tsx — server component: getSession() or redirect("/login");
  renders Sidebar + Topbar + <WarningOverlay/> + children. Must import
  WarningOverlay from "@/components/WarningOverlay" (Agent E creates it).
- C: /(app)/dashboard — server component, role-aware: admin → totals + recent
  events + system health (from /api/dashboard shape — fetch via direct lib calls
  or fetch to same-origin API; use direct lib calls to avoid self-fetch);
  user → own locations/devices summary + live mini chart (client component).
- C: /(app)/monitoring — client page: device selector (GET /api/devices),
  EventSource to /api/stream?device_id=..., LiveChart, metric cards
  (PGA gal + SIG level, RMS, freq, amp, duration), classification + confidence,
  warning status chip. Label classifier "Seismora AI v1.0 — rule-based demo classifier".
- D: /(app)/locations, /buildings, /areas, /devices — client CRUD pages:
  table + Modal form. Location form fields: name, type (select: Rumah/Kampus/
  Kantor/Pabrik/Sekolah/Lainnya), province, city, district, address, lat, lng
  (manual inputs + "pilih di peta" link to /map?pick=1 — simple: clicking map
  sets lat/lng via URL param read on return; keep simple, manual lat/lng is
  acceptable, map-pick is nice-to-have), photo_url, description.
  Device form: device_id, name, sensor_type (MPU6050 default), location/building/
  area selects, interval_ms. Devices: user role read-only (hide create/edit).
- D: /(app)/map — client page, `next/dynamic` ssr:false Leaflet map
  (react-leaflet MapContainer + TileLayer OSM + Marker per location/device;
  popup with name/status/link; fix default icon via L.divIcon or custom icon URL
  from /public — use divIcon colored dots, simplest robust).
- D: /(app)/profile — client page: name/email edit, password change,
  notification preference checkboxes (stored in localStorage — Stage 1),
  logout button.
- D: /(app)/users — admin only: table + create/edit/disable/reset-password
  (reset = set password "user123" + show toast; do NOT display hashes).
- E: /(app)/scenario — admin only: 4 scenario buttons + Stop (back to normal),
  current scenario + live metrics strip; note "hanya demo device ESP32-001".
- E: /(app)/history — filters (device, level, date from/to) + table; click row →
  /(app)/history/[id] detail: metrics + LiveChart from snapshot_json + ack button.
- E: /(app)/reports — filters + "Unduh CSV" button (GET /api/events/export).

## File ownership (EXCLUSIVE — do not write files owned by another agent)
- A (backend core): src/lib/types.ts, src/lib/db.ts, src/lib/auth.ts,
  src/lib/signal.ts, src/lib/simulator.ts, src/app/api/auth/**,
  src/app/api/scenario/**, src/app/api/stream/**, src/app/api/warnings/**,
  src/app/api/dashboard/**
- B (backend CRUD): src/app/api/locations/**, src/app/api/buildings/**,
  src/app/api/areas/**, src/app/api/devices/**, src/app/api/events/**,
  src/app/api/users/**, src/app/api/profile/**
- C (shell + dashboards): src/app/globals.css, src/app/layout.tsx,
  src/app/login/**, src/app/(app)/layout.tsx, src/app/(app)/dashboard/**,
  src/app/(app)/monitoring/**, src/components/Sidebar.tsx,
  src/components/Topbar.tsx, src/components/StatCard.tsx,
  src/components/LiveChart.tsx
- D (management + map + profile): src/app/(app)/locations/**,
  src/app/(app)/buildings/**, src/app/(app)/areas/**, src/app/(app)/devices/**,
  src/app/(app)/map/**, src/app/(app)/profile/**, src/app/(app)/users/**,
  src/components/Modal.tsx
- E (warnings + history + scenario + reports): src/components/WarningOverlay.tsx,
  src/app/(app)/scenario/**, src/app/(app)/history/**, src/app/(app)/reports/**
- Coordinator (me) owns: package.json, next.config.ts, tsconfig.json, Dockerfile,
  .dockerignore, .env.example, README.md, RENCANA-DEMO-LOMBA.md.
- `src/app/page.tsx` (scaffold default): DELETE it or make it redirect to
  /dashboard — Agent C owns this file (redirect to /login if no session,
  else /dashboard; simplest: `redirect("/dashboard")` and let the (app) layout guard).

## Verification each agent must do before reporting back
- `npx tsc --noEmit` — fix YOUR OWN type errors. Errors of the form
  "Cannot find module '@/...'" for files owned by ANOTHER agent are expected
  before integration — list them, do not hack around them.
- Do NOT run `npm run build` (coordinator runs it after integration).
- Report: files created, any contract deviation (with reason), and the exact
  `tsc` output summary for your files.
