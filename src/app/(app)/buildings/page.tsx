"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/Modal";
import type { BuildingRow, LocationRow, SessionUser } from "@/lib/types";

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

interface BuildingForm {
  location_id: string;
  name: string;
  code: string;
  type: string;
  floors: string;
  description: string;
}

const EMPTY_FORM: BuildingForm = {
  location_id: "",
  name: "",
  code: "",
  type: "",
  floors: "1",
  description: "",
};

const inputCls =
  "w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-[#94A3B8]";

export default function BuildingsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BuildingRow | null>(null);
  const [form, setForm] = useState<BuildingForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isAdmin = me?.role === "super_admin";

  const load = useCallback(async (locationId: string) => {
    setLoading(true);
    try {
      const [user, locs, rows] = await Promise.all([
        api<SessionUser>("/api/auth/me"),
        api<LocationRow[]>("/api/locations"),
        api<BuildingRow[]>(
          locationId === "all" ? "/api/buildings" : `/api/buildings?location_id=${locationId}`,
        ),
      ]);
      setMe(user);
      setLocations(locs);
      setBuildings(rows);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memuat data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filterLocation);
  }, [load, filterLocation]);

  function locationName(id: number): string {
    return locations.find((l) => l.id === id)?.name ?? `#${id}`;
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, location_id: filterLocation !== "all" ? filterLocation : (locations[0]?.id.toString() ?? "") });
    setModalOpen(true);
  }

  function openEdit(row: BuildingRow) {
    setEditing(row);
    setForm({
      location_id: String(row.location_id),
      name: row.name,
      code: row.code,
      type: row.type,
      floors: String(row.floors),
      description: row.description,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        location_id: Number(form.location_id),
        name: form.name,
        code: form.code,
        type: form.type,
        floors: Number(form.floors),
        description: form.description,
      };
      if (editing) {
        await api<BuildingRow>(`/api/buildings/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Bangunan berhasil diperbarui." });
      } else {
        await api<BuildingRow>("/api/buildings", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Bangunan berhasil ditambahkan." });
      }
      setModalOpen(false);
      await load(filterLocation);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan bangunan" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: BuildingRow) {
    if (!window.confirm(`Hapus bangunan "${row.name}"? Area dan perangkat di bawahnya ikut terhapus.`)) return;
    try {
      await api<unknown>(`/api/buildings/${row.id}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: "Bangunan berhasil dihapus." });
      await load(filterLocation);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menghapus bangunan" });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#F1F5F9]">Bangunan</h1>
          <p className="text-sm text-[#94A3B8]">Bangunan di setiap lokasi.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={locations.length === 0}
          className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50"
        >
          + Tambah Bangunan
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="filter-lokasi" className="text-sm text-[#94A3B8]">Lokasi:</label>
        <select
          id="filter-lokasi"
          className="rounded-md border border-[#1E293B] bg-[#0B0F16] px-3 py-2 text-sm text-[#F1F5F9] focus:border-[#22D3EE] focus:outline-none"
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
        >
          <option value="all">Semua lokasi</option>
          {locations.map((l) => (
            <option key={l.id} value={String(l.id)}>{l.name}</option>
          ))}
        </select>
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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Lokasi</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Lantai</th>
              <th className="px-4 py-3">Deskripsi</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[#94A3B8]">Memuat…</td>
              </tr>
            ) : buildings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[#94A3B8]">
                  Belum ada bangunan. {locations.length === 0 ? "Buat lokasi dulu." : ""}
                </td>
              </tr>
            ) : (
              buildings.map((row) => (
                <tr key={row.id} className="border-b border-[#1E293B]/60 last:border-0 hover:bg-[#10151F]">
                  <td className="px-4 py-3 font-medium text-[#F1F5F9]">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">{row.code}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{locationName(row.location_id)}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{row.type || "—"}</td>
                  <td className="px-4 py-3 font-mono text-[#94A3B8]">{row.floors}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-[#94A3B8]" title={row.description}>
                    {row.description || "—"}
                  </td>
                  {(isAdmin || locations.some((l) => l.id === row.location_id)) && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEdit(row)} aria-label={`Ubah ${row.name}`}
                          className="rounded-md border border-[#1E293B] px-2 py-1 text-xs text-[#F1F5F9] hover:bg-[#10151F]">
                          ✎ Ubah
                        </button>
                        <button type="button" onClick={() => void handleDelete(row)} aria-label={`Hapus ${row.name}`}
                          className="rounded-md border border-[#EF4444]/40 px-2 py-1 text-xs text-[#FCA5A5] hover:bg-[#EF4444]/10">
                          Hapus
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Ubah Bangunan" : "Tambah Bangunan"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="bld-location" className={labelCls}>Lokasi *</label>
            <select id="bld-location" required className={inputCls} value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
              <option value="" disabled>Pilih lokasi</option>
              {locations.map((l) => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bld-name" className={labelCls}>Nama bangunan *</label>
              <input id="bld-name" required className={inputCls} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Gedung A" />
            </div>
            <div>
              <label htmlFor="bld-code" className={labelCls}>Kode *</label>
              <input id="bld-code" required className={inputCls} value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="GD-A" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bld-type" className={labelCls}>Tipe</label>
              <input id="bld-type" className={inputCls} value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Kantor / Kuliah" />
            </div>
            <div>
              <label htmlFor="bld-floors" className={labelCls}>Jumlah lantai *</label>
              <input id="bld-floors" required type="number" min={1} step={1} className={inputCls} value={form.floors}
                onChange={(e) => setForm({ ...form, floors: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="bld-desc" className={labelCls}>Deskripsi</label>
            <textarea id="bld-desc" rows={2} className={inputCls} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
