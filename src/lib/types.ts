// SEISMORA — shared types (Stage 1, SIMULASI SAJA — tanpa hardware nyata).
// Single source of truth untuk bentuk data antar modul, sesuai CONTRACT.md.

export type Role = "super_admin" | "user";

export type WarningLevel = "normal" | "waspada" | "siaga" | "bahaya";

export type Classification = "normal" | "minor" | "anomaly" | "seismic";

export type Scenario = "normal" | "minor" | "anomaly" | "seismic";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: Role;
}

export interface UserRow {
  id: number;
  username: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  created_at: string;
  last_login_at: string | null;
}

export interface LocationRow {
  id: number;
  name: string;
  type: string;
  province: string;
  city: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  photo_url: string;
  description: string;
  owner_id: number | null;
}

export interface BuildingRow {
  id: number;
  location_id: number;
  name: string;
  code: string;
  type: string;
  floors: number;
  description: string;
}

export interface AreaRow {
  id: number;
  building_id: number;
  name: string;
  code: string;
  floor: number;
  description: string;
}

export interface DeviceRow {
  id: number;
  device_id: string;
  name: string;
  sensor_type: string;
  location_id: number;
  building_id: number | null;
  area_id: number | null;
  status: "online" | "offline";
  interval_ms: number;
  last_activity_at: string | null;
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface Metrics {
  pga_gal: number;
  sig_level: number;
  rms: number;
  freq_hz: number;
  amp_ms2: number;
  duration_s: number;
  classification: Classification;
  confidence: number;
  warning: WarningLevel;
}

export interface EventRow {
  id: number;
  device_id: string;
  started_at: string;
  ended_at: string | null;
  classification: Classification;
  warning: WarningLevel;
  peak_pga_gal: number;
  peak_rms: number;
  dominant_freq: number;
  duration_s: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  snapshot_json: string | null;
}

export interface TickMsg {
  type: "tick";
  device_id: string;
  samples: Sample[];
  metrics: Metrics;
  scenario: Scenario;
  at: string;
}

/** Bentuk kembalian simulator.getCurrentWarning() (null = tidak ada peringatan aktif). */
export interface CurrentWarning {
  active: boolean;
  event_id: number | null;
  level: WarningLevel;
  classification: Classification;
  pga_gal: number;
  sig_level: number;
  device_id: string;
  device_name: string;
  location_name: string;
  started_at: string | null;
  confidence: number;
}

export interface DashboardTotals {
  locations: number;
  buildings: number;
  areas: number;
  devices: number;
  devicesOnline: number;
  events: number;
  activeWarnings: number;
  users: number;
}

export interface DashboardSummary {
  totals: DashboardTotals;
  recentEvents: EventRow[];
}
