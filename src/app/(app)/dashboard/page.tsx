import { redirect } from "next/navigation";
import { getSession, visibleLocationIds } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";
import { StatCard } from "@/components/StatCard";
import LiveMiniChart from "./LiveMiniChart";
import type {
  Classification,
  DeviceRow,
  EventRow,
  LocationRow,
  WarningLevel,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const CLASSIFICATION_LABEL: Record<Classification, string> = {
  normal: "Normal",
  minor: "Getaran Kecil",
  anomaly: "Anomali",
  seismic: "Potensi Gempa",
};

const WARNING_LABEL: Record<WarningLevel, string> = {
  normal: "Normal",
  waspada: "Waspada",
  siaga: "Siaga",
  bahaya: "Bahaya",
};

const WARNING_TONE: Record<WarningLevel, string> = {
  normal: "text-ok",
  waspada: "text-warn",
  siaga: "text-alert",
  bahaya: "text-danger",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

function RecentEventsTable({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Belum ada kejadian tercatat.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-widest text-muted">
            <th className="px-3 py-2 font-semibold">Waktu</th>
            <th className="px-3 py-2 font-semibold">Perangkat</th>
            <th className="px-3 py-2 font-semibold">Klasifikasi</th>
            <th className="px-3 py-2 font-semibold">Peringatan</th>
            <th className="px-3 py-2 text-right font-semibold">PGA Puncak (gal)</th>
            <th className="px-3 py-2 text-right font-semibold">Durasi (d)</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id} className="border-b border-line/60 last:border-0">
              <td className="px-3 py-2.5 whitespace-nowrap text-ink">
                {formatDateTime(ev.started_at)}
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-ink">
                {ev.device_id}
              </td>
              <td className="px-3 py-2.5 text-ink">
                {CLASSIFICATION_LABEL[ev.classification]}
              </td>
              <td className={`px-3 py-2.5 font-semibold ${WARNING_TONE[ev.warning]}`}>
                {WARNING_LABEL[ev.warning]}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">
                {ev.peak_pga_gal.toFixed(1)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink">
                {ev.duration_s.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function count(table: string, where?: string): Promise<number> {
  const row = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM ${table}${where ? ` WHERE ${where}` : ""}`,
  );
  return row?.c ?? 0;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "super_admin";

  if (isAdmin) {
    const [
      totalUsers,
      totalLocations,
      totalBuildings,
      totalDevices,
      onlineDevices,
      totalEvents,
      totalAnomalies,
      totalWarnings,
    ] = await Promise.all([
      count("users"),
      count("locations"),
      count("buildings"),
      count("devices"),
      count("devices", "status = 'online'"),
      count("events"),
      count("events", "classification IN ('anomaly', 'seismic')"),
      count("events", "warning != 'normal'"),
    ]);
    const offlineDevices = totalDevices - onlineDevices;
    const recentEvents = queryAll<EventRow>(
      "SELECT * FROM events ORDER BY started_at DESC LIMIT 10",
    );

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Selamat datang, {session.name} — ringkasan sistem SIPAT.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pengguna" value={String(totalUsers)} tone="cyan" />
          <StatCard label="Lokasi" value={String(totalLocations)} tone="cyan" />
          <StatCard label="Bangunan" value={String(totalBuildings)} tone="cyan" />
          <StatCard
            label="Perangkat"
            value={String(totalDevices)}
            sub={`${onlineDevices} online · ${offlineDevices} offline`}
            tone="cyan"
          />
          <StatCard
            label="Perangkat Online"
            value={String(onlineDevices)}
            sub={`${offlineDevices} offline`}
            tone="green"
          />
          <StatCard
            label="Total Deteksi"
            value={String(totalEvents)}
            sub="Semua kejadian tercatat"
            tone="slate"
          />
          <StatCard
            label="Anomali / Seismik"
            value={String(totalAnomalies)}
            sub="Klasifikasi anomaly & seismic"
            tone="orange"
          />
          <StatCard
            label="Peringatan"
            value={String(totalWarnings)}
            sub="Kejadian dengan level di atas normal"
            tone="red"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="text-base font-bold text-ink">Kesehatan Sistem</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between border-b border-line/60 pb-2">
                <dt className="text-muted">Basis data</dt>
                <dd className="font-semibold text-ok">Terhubung</dd>
              </div>
              <div className="flex justify-between border-b border-line/60 pb-2">
                <dt className="text-muted">Perangkat online</dt>
                <dd className="font-mono font-semibold text-ink">
                  {onlineDevices} / {totalDevices}
                </dd>
              </div>
              <div className="flex justify-between border-b border-line/60 pb-2">
                <dt className="text-muted">Perangkat simulasi</dt>
                <dd className="font-mono font-semibold text-ink">ESP32-001</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Klasifikasi</dt>
                <dd className="text-right font-semibold text-ink">
                  SIPAT AI v1.0 — rule-based demo
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Simulasi demo — sensor MPU6050 kelas prototipe; PGA bukan
              magnitudo.
            </p>
          </section>

          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="text-base font-bold text-ink">Sinyal Langsung</h2>
            <div className="mt-3">
              <LiveMiniChart deviceId="ESP32-001" />
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Kejadian Terbaru</h2>
            <a href="/history" className="text-sm font-medium text-action hover:underline">
              Lihat riwayat →
            </a>
          </div>
          <RecentEventsTable events={recentEvents} />
        </section>
      </div>
    );
  }

  // ---- User biasa: hanya lokasi & perangkat miliknya ----
  const locationIds = visibleLocationIds(session);

  if (locationIds.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Selamat datang, {session.name}.</p>
        </div>
        <section className="rounded-xl border border-line bg-panel p-8 text-center">
          <p className="text-base font-semibold text-ink">
            Belum ada lokasi yang ditautkan ke akun Anda.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Akun Anda belum memiliki akses ke lokasi mana pun. Hubungi Super
            Admin agar lokasi Anda ditautkan, sehingga perangkat dan riwayat
            deteksi bisa tampil di sini.
          </p>
        </section>
      </div>
    );
  }

  const locPh = placeholders(locationIds.length);
  const locations = queryAll<LocationRow>(
    `SELECT * FROM locations WHERE id IN (${locPh}) ORDER BY name`,
    locationIds,
  );
  const devices = queryAll<DeviceRow>(
    `SELECT * FROM devices WHERE location_id IN (${locPh}) ORDER BY device_id`,
    locationIds,
  );
  const deviceIds = devices.map((d: DeviceRow) => d.device_id);
  const recentEvents =
    deviceIds.length > 0
      ? queryAll<EventRow>(
          `SELECT * FROM events WHERE device_id IN (${placeholders(deviceIds.length)}) ORDER BY started_at DESC LIMIT 10`,
          deviceIds,
        )
      : [];
  const onlineDevices = devices.filter((d: DeviceRow) => d.status === "online").length;
  const firstOnline = devices.find((d: DeviceRow) => d.status === "online") ?? devices[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Selamat datang, {session.name} — ringkasan lokasi &amp; perangkat Anda.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Lokasi Saya" value={String(locations.length)} tone="cyan" />
        <StatCard label="Perangkat" value={String(devices.length)} tone="cyan" />
        <StatCard
          label="Perangkat Online"
          value={String(onlineDevices)}
          sub={`${devices.length - onlineDevices} offline`}
          tone="green"
        />
        <StatCard
          label="Deteksi di Lokasi Saya"
          value={String(recentEvents.length)}
          sub="10 kejadian terbaru"
          tone="orange"
        />
      </div>

      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-bold text-ink">Lokasi Saya</h2>
        <ul className="mt-3 divide-y divide-line/60">
          {locations.map((loc: LocationRow) => {
            const locDevices = devices.filter((d: DeviceRow) => d.location_id === loc.id);
            const locOnline = locDevices.filter((d: DeviceRow) => d.status === "online").length;
            return (
              <li key={loc.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-ink">{loc.name}</p>
                  <p className="text-xs text-muted">
                    {loc.city}, {loc.province} · {locDevices.length} perangkat
                    ({locOnline} online)
                  </p>
                </div>
                <a
                  href="/locations"
                  className="shrink-0 text-sm font-medium text-action hover:underline"
                >
                  Detail →
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {firstOnline ? (
        <section className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-base font-bold text-ink">Sinyal Langsung</h2>
          <div className="mt-3">
            <LiveMiniChart deviceId={firstOnline.device_id} />
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Kejadian Terbaru</h2>
          <a href="/history" className="text-sm font-medium text-action hover:underline">
            Lihat riwayat →
          </a>
        </div>
        <RecentEventsTable events={recentEvents} />
      </section>
    </div>
  );
}
