"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/Modal";
import type { AreaRow, BuildingRow, DeviceRow, LocationRow, SessionUser } from "@/lib/types";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as Envelope<T>;
  if (!body.ok || body.data === undefined) {
    throw new Error(body.error ?? `Permintaan gagal (${res.status})`);
  }
  return body.data;
}

interface DeviceForm {
  device_id: string;
  name: string;
  sensor_type: string;
  location_id: string;
  building_id: string;
  area_id: string;
  interval_ms: string;
}

const EMPTY_FORM: DeviceForm = {
  device_id: "",
  name: "",
  sensor_type: "MPU6050",
  location_id: "",
  building_id: "",
  area_id: "",
  interval_ms: "100",
};

const inputCls =
  "w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-[#94A3B8]";

export default function DevicesPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceRow | null>(null);
  const [form, setForm] = useState<DeviceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isAdmin = me?.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, devs, locs, blds, ars] = await Promise.all([
        api<SessionUser>("/api/auth/me"),
        api<DeviceRow[]>("/api/devices"),
        api<LocationRow[]>("/api/locations"),
        api<BuildingRow[]>("/api/buildings"),
        api<AreaRow[]>("/api/areas"),
      ]);
      setMe(user);
      setDevices(devs);
      setLocations(locs);
      setBuildings(blds);
      setAreas(ars);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memuat data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formBuildings = useMemo(
    () => buildings.filter((b) => String(b.location_id) === form.location_id),
    [buildings, form.location_id],
  );
  const formAreas = useMemo(
    () => areas.filter((a) => String(a.building_id) === form.building_id),
    [areas, form.building_id],
  );

  function locationName(id: number): string {
    return locations.find((l) => l.id === id)?.name ?? `#${id}`;
  }
  function buildingName(id: number | null): string {
    if (id === null) return "—";
    return buildings.find((b) => b.id === id)?.name ?? `#${id}`;
  }
  function areaName(id: number | null): string {
    if (id === null) return "—";
    return areas.find((a) => a.id === id)?.name ?? `#${id}`;
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, location_id: locations[0]?.id.toString() ?? "" });
    setModalOpen(true);
  }

  function openEdit(row: DeviceRow) {
    setEditing(row);
    setForm({
      device_id: row.device_id,
      name: row.name,
      sensor_type: row.sensor_type,
      location_id: String(row.location_id),
      building_id: row.building_id === null ? "" : String(row.building_id),
      area_id: row.area_id === null ? "" : String(row.area_id),
      interval_ms: String(row.interval_ms),
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        device_id: form.device_id,
        name: form.name,
        sensor_type: form.sensor_type,
        location_id: Number(form.location_id),
        building_id: form.building_id === "" ? null : Number(form.building_id),
        area_id: form.area_id === "" ? null : Number(form.area_id),
        interval_ms: Number(form.interval_ms),
      };
      if (editing) {
        await api<DeviceRow>(`/api/devices/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Perangkat berhasil diperbarui." });
      } else {
        await api<DeviceRow>("/api/devices", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Perangkat berhasil ditambahkan." });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan perangkat" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: DeviceRow) {
    if (!window.confirm(`Hapus perangkat "${row.device_id} — ${row.name}"?`)) return;
    try {
      await api<unknown>(`/api/devices/${row.id}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: "Perangkat berhasil dihapus." });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menghapus perangkat" });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#F1F5F9]">Perangkat</h1>
          <p className="text-sm text-[#94A3B8]">
            {isAdmin
              ? "Sensor ESP32 / MPU6050 di setiap lokasi."
              : "Sensor ESP32 / MPU6050 di lokasi Anda."}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={locations.length === 0}
          className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50"
        >
          + Tambah Perangkat
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#86EFAC]"
              : "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5]"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B0F16]">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-3">Device ID</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Sensor</th>
              <th className="px-4 py-3">Lokasi</th>
              <th className="px-4 py-3">Bangunan / Area</th>
              <th className="px-4 py-3">Interval</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aktivitas Terakhir</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-[#94A3B8]">Memuat…</td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-[#94A3B8]">
                  Belum ada perangkat.
                </td>
              </tr>
            ) : (
              devices.map((row) => (
                <tr key={row.id} className="border-b border-[#1E293B]/60 last:border-0 hover:bg-[#10151F]">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-[#F1F5F9]">{row.device_id}</td>
                  <td className="px-4 py-3 text-[#F1F5F9]">{row.name}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{row.sensor_type}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{locationName(row.location_id)}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">
                    {buildingName(row.building_id)} / {areaName(row.area_id)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">{row.interval_ms} ms</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "online"
                          ? "bg-[#22C55E]/15 text-[#86EFAC]"
                          : "bg-[#64748B]/15 text-[#94A3B8]"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${row.status === "online" ? "bg-[#22C55E]" : "bg-[#64748B]"}`} />
                      {row.status === "online" ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">
                    {row.last_activity_at ?? "—"}
                  </td>
                  {(isAdmin || locations.some((l) => l.id === row.location_id)) && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEdit(row)} aria-label={`Ubah ${row.device_id}`}
                          className="rounded-md border border-[#1E293B] px-2 py-1 text-xs text-[#F1F5F9] hover:bg-[#10151F]">
                          ✎ Ubah
                        </button>
                        <button type="button" onClick={() => void handleDelete(row)} aria-label={`Hapus ${row.device_id}`}
                          disabled={row.device_id === "ESP32-001"}
                          title={row.device_id === "ESP32-001" ? "Perangkat demo dikunci — sumber data simulator" : undefined}
                          className="rounded-md border border-[#EF4444]/40 px-2 py-1 text-xs text-[#FCA5A5] hover:bg-[#EF4444]/10 disabled:cursor-not-allowed disabled:opacity-40">
                          {row.device_id === "ESP32-001" ? "🔒 Terkunci" : "Hapus"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Ubah Perangkat" : "Tambah Perangkat"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dev-id" className={labelCls}>Device ID *</label>
              <input id="dev-id" required className={inputCls} value={form.device_id}
                onChange={(e) => setForm({ ...form, device_id: e.target.value })} placeholder="ESP32-001" />
            </div>
            <div>
              <label htmlFor="dev-name" className={labelCls}>Nama perangkat *</label>
              <input id="dev-name" required className={inputCls} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sensor Gedung A" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dev-sensor" className={labelCls}>Tipe sensor</label>
              <input id="dev-sensor" className={inputCls} value={form.sensor_type}
                onChange={(e) => setForm({ ...form, sensor_type: e.target.value })} placeholder="MPU6050" />
            </div>
            <div>
              <label htmlFor="dev-interval" className={labelCls}>Interval (ms) *</label>
              <input id="dev-interval" required type="number" min={10} step={10} className={inputCls} value={form.interval_ms}
                onChange={(e) => setForm({ ...form, interval_ms: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="dev-location" className={labelCls}>Lokasi *</label>
            <select id="dev-location" required className={inputCls} value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value, building_id: "", area_id: "" })}>
              <option value="" disabled>Pilih lokasi</option>
              {locations.map((l) => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dev-building" className={labelCls}>Bangunan</label>
              <select id="dev-building" className={inputCls} value={form.building_id}
                onChange={(e) => setForm({ ...form, building_id: e.target.value, area_id: "" })}>
                <option value="">— Tanpa bangunan —</option>
                {formBuildings.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dev-area" className={labelCls}>Area</label>
              <select id="dev-area" className={inputCls} value={form.area_id}
                onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
                <option value="">— Tanpa area —</option>
                {formAreas.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="rounded-md border border-[#1E293B] px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#10151F]">Batal</button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50">
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
