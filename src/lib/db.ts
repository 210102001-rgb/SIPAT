// SEISMORA — lapisan database (node:sqlite, Node 24).
// File DB: process.env.DB_PATH || <project>/data/seismora.sqlite.
// getDb() lazy: membuat direktori data, membuka DB, dan menjalankan initDb()
// (CREATE TABLE IF NOT EXISTS + seed) pada pemakaian pertama.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { hashSync } from "bcryptjs";
import { DatabaseSync } from "node:sqlite";

export type SqlParam = string | number | bigint | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

let db: DatabaseSync | null = null;

function dbPath(): string {
  return process.env.DB_PATH || join(process.cwd(), "data", "seismora.sqlite");
}

/** Direktori upload foto — di samping file DB (volume /data di Docker),
 *  jadi file ikut persisten saat container di-rebuild. */
export function uploadDir(): string {
  const dir = join(dirname(dbPath()), "uploads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  initDb(db);
  return db;
}

export function initDb(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Lainnya',
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      lat REAL NOT NULL DEFAULT 0,
      lng REAL NOT NULL DEFAULT 0,
      photo_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS location_users (
      location_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (location_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      floors INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      floor INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sensor_type TEXT NOT NULL DEFAULT 'MPU6050',
      location_id INTEGER NOT NULL,
      building_id INTEGER,
      area_id INTEGER,
      status TEXT NOT NULL DEFAULT 'offline',
      interval_ms INTEGER NOT NULL DEFAULT 100,
      last_activity_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      classification TEXT NOT NULL DEFAULT 'normal',
      warning TEXT NOT NULL DEFAULT 'normal',
      peak_pga_gal REAL NOT NULL DEFAULT 0,
      peak_rms REAL NOT NULL DEFAULT 0,
      dominant_freq REAL NOT NULL DEFAULT 0,
      duration_s REAL NOT NULL DEFAULT 0,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      snapshot_json TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  const userCount = database
    .prepare("SELECT COUNT(*) AS c FROM users")
    .get() as unknown as { c: number };
  if (userCount.c > 0) return;

  const now = new Date().toISOString();
  const adminId = Number(
    database
      .prepare(
        "INSERT INTO users (username, password_hash, name, email, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
      )
      .run("admin", hashSync("admin123", 10), "Administrator", "admin@seismora.local", "super_admin", now)
      .lastInsertRowid,
  );
  void adminId;
  const demoId = Number(
    database
      .prepare(
        "INSERT INTO users (username, password_hash, name, email, role, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
      )
      .run("demo", hashSync("demo123", 10), "Demo User", "demo@seismora.local", "user", now)
      .lastInsertRowid,
  );
  const locationId = Number(
    database
      .prepare(
        "INSERT INTO locations (name, type, province, city, district, address, lat, lng, photo_url, description, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)",
      )
      .run(
        "Kampus Demo",
        "Kampus",
        "Jawa Tengah",
        "Surakarta",
        "Jebres",
        "Jl. Demo No. 1, Surakarta",
        -7.5595,
        110.8298,
        demoId,
      ).lastInsertRowid,
  );
  const buildingId = Number(
    database
      .prepare(
        "INSERT INTO buildings (location_id, name, code, type, floors, description) VALUES (?, ?, ?, ?, ?, '')",
      )
      .run(locationId, "Gedung A", "GD-A", "Kampus", 3).lastInsertRowid,
  );
  const areaId = Number(
    database
      .prepare(
        "INSERT INTO areas (building_id, name, code, floor, description) VALUES (?, ?, ?, ?, '')",
      )
      .run(buildingId, "Lantai 1", "LT-1", 1).lastInsertRowid,
  );
  database
    .prepare(
      "INSERT INTO devices (device_id, name, sensor_type, location_id, building_id, area_id, status, interval_ms) VALUES (?, ?, 'MPU6050', ?, ?, ?, 'online', 100)",
    )
    .run("ESP32-001", "Sensor Gedung A", locationId, buildingId, areaId);
  database
    .prepare("INSERT INTO location_users (location_id, user_id) VALUES (?, ?)")
    .run(locationId, demoId);
}

export function queryAll<T>(sql: string, params: SqlParam[] = []): T[] {
  const rows = getDb().prepare(sql).all(...params) as unknown as T[];
  return rows;
}

export function queryOne<T>(sql: string, params: SqlParam[] = []): T | null {
  const row = getDb().prepare(sql).get(...params) as unknown as T | undefined;
  return row === undefined ? null : row;
}

export function run(sql: string, params: SqlParam[] = []): RunResult {
  const result = getDb().prepare(sql).run(...params);
  // node:sqlite mengembalikan number | bigint; id autoincrement muat di number.
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}
