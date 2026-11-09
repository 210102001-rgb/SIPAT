// GET /api/dashboard — ringkasan sesuai peran.
// Admin: total seluruh lokasi/perangkat/event/user + 10 event terbaru.
// User: hanya lokasi miliknya (visibleLocationIds) + perangkat/event di sana;
// totals.users = 1 (diri sendiri).
import { requireSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";
import type { SqlParam } from "@/lib/db";
import type { DashboardSummary, EventRow, SessionUser } from "@/lib/types";


function count(sql: string, params: SqlParam[] = []): number {
  const row = queryOne<{ c: number }>(sql, params);
  return row ? row.c : 0;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

export async function GET(): Promise<Response> {
  let session: SessionUser;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const isAdmin = session.role === "super_admin";
  const locationIds = visibleLocationIds(session);

  let totals: DashboardSummary["totals"];
  let recentEvents: EventRow[];

  if (isAdmin) {
    totals = {
      locations: count("SELECT COUNT(*) AS c FROM locations"),
      buildings: count("SELECT COUNT(*) AS c FROM buildings"),
      areas: count("SELECT COUNT(*) AS c FROM areas"),
      devices: count("SELECT COUNT(*) AS c FROM devices"),
      devicesOnline: count("SELECT COUNT(*) AS c FROM devices WHERE status = 'online'"),
      events: count("SELECT COUNT(*) AS c FROM events"),
      activeWarnings: count("SELECT COUNT(*) AS c FROM events WHERE ended_at IS NULL"),
      users: count("SELECT COUNT(*) AS c FROM users"),
    };
    recentEvents = queryAll<EventRow>(
      "SELECT * FROM events ORDER BY started_at DESC LIMIT 10",
    );
  } else if (locationIds.length === 0) {
    totals = {
      locations: 0,
      buildings: 0,
      areas: 0,
      devices: 0,
      devicesOnline: 0,
      events: 0,
      activeWarnings: 0,
      users: 1,
    };
    recentEvents = [];
  } else {
    const locIn = placeholders(locationIds.length);
    const locParams: SqlParam[] = [...locationIds];
    const deviceIds = queryAll<{ device_id: string }>(
      `SELECT device_id FROM devices WHERE location_id IN (${locIn})`,
      locParams,
    ).map((row) => row.device_id);
    const buildingIds = queryAll<{ id: number }>(
      `SELECT id FROM buildings WHERE location_id IN (${locIn})`,
      locParams,
    ).map((row) => row.id);

    let areaCount = 0;
    if (buildingIds.length > 0) {
      areaCount = count(
        `SELECT COUNT(*) AS c FROM areas WHERE building_id IN (${placeholders(buildingIds.length)})`,
        [...buildingIds],
      );
    }

    let eventCount = 0;
    let activeCount = 0;
    if (deviceIds.length > 0) {
      const devIn = placeholders(deviceIds.length);
      const devParams: SqlParam[] = [...deviceIds];
      eventCount = count(
        `SELECT COUNT(*) AS c FROM events WHERE device_id IN (${devIn})`,
        devParams,
      );
      activeCount = count(
        `SELECT COUNT(*) AS c FROM events WHERE ended_at IS NULL AND device_id IN (${devIn})`,
        devParams,
      );
      recentEvents = queryAll<EventRow>(
        `SELECT * FROM events WHERE device_id IN (${devIn}) ORDER BY started_at DESC LIMIT 10`,
        devParams,
      );
    } else {
      recentEvents = [];
    }

    totals = {
      locations: locationIds.length,
      buildings: buildingIds.length,
      areas: areaCount,
      devices: deviceIds.length,
      devicesOnline: count(
        `SELECT COUNT(*) AS c FROM devices WHERE status = 'online' AND location_id IN (${locIn})`,
        locParams,
      ),
      events: eventCount,
      activeWarnings: activeCount,
      users: 1,
    };
  }

  const summary: DashboardSummary = { totals, recentEvents };
  return Response.json({ ok: true, data: summary });
}
