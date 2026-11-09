"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/Modal";
import type { AreaRow, BuildingRow, SessionUser } from "@/lib/types";

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

interface AreaForm {
  building_id: string;
  name: string;
  code: string;
  floor: string;
  description: string;
}

const EMPTY_FORM: AreaForm = {
  building_id: "",
  name: "",
  code: "",
  floor: "1",
  description: "",
};

const inputCls =
  "w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-[#94A3B8]";

export default function AreasPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [form, setForm] = useState<AreaForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isAdmin = me?.role === "super_admin";

  const load = useCallback(async (buildingId: string) => {
    setLoading(true);
    try {
      const [user, blds, rows] = await Promise.all([
        api<SessionUser>("/api/auth/me"),
        api<BuildingRow[]>("/api/buildings"),
        api<AreaRow[]>(
          buildingId === "all" ? "/api/areas" : `/api/areas?building_id=${buildingId}`,
        ),
      ]);
      setMe(user);
      setBuildings(blds);
      setAreas(rows);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memuat data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filterBuilding);
  }, [load, filterBuilding]);

  function buildingName(id: number): string {
    return buildings.find((b) => b.id === id)?.name ?? `#${id}`;
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, building_id: filterBuilding !== "all" ? filterBuilding : (buildings[0]?.id.toString() ?? "") });
    setModalOpen(true);
  }

  function openEdit(row: AreaRow) {
    setEditing(row);
    setForm({
      building_id: String(row.building_id),
      name: row.name,
      code: row.code,
      floor: String(row.floor),
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
        building_id: Number(form.building_id),
        name: form.name,
        code: form.code,
        floor: Number(form.floor),
        description: form.description,
      };
      if (editing) {
        await api<AreaRow>(`/api/areas/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Area berhasil diperbarui." });
      } else {
        await api<AreaRow>("/api/areas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Area berhasil ditambahkan." });
      }
      setModalOpen(false);
      await load(filterBuilding);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan area" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: AreaRow) {
    if (!window.confirm(`Hapus area "${row.name}"?`)) return;
    try {
      await api<unknown>(`/api/areas/${row.id}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: "Area berhasil dihapus." });
      await load(filterBuilding);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menghapus area" });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#F1F5F9]">Area</h1>
          <p className="text-sm text-[#94A3B8]">Area / lantai di setiap bangunan.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={buildings.length === 0}
          className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50"
        >
          + Tambah Area
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="filter-bangunan" className="text-sm text-[#94A3B8]">Bangunan:</label>
        <select
          id="filter-bangunan"
          className="rounded-md border border-[#1E293B] bg-[#0B0F16] px-3 py-2 text-sm text-[#F1F5F9] focus:border-[#22D3EE] focus:outline-none"
          value={filterBuilding}
          onChange={(e) => setFilterBuilding(e.target.value)}
        >
          <option value="all">Semua bangunan</option>
          {buildings.map((b) => (
            <option key={b.id} value={String(b.id)}>{b.name}</option>
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
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Bangunan</th>
              <th className="px-4 py-3">Lantai</th>
              <th className="px-4 py-3">Deskripsi</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#94A3B8]">Memuat…</td>
              </tr>
            ) : areas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#94A3B8]">
                  Belum ada area. {buildings.length === 0 ? "Buat bangunan dulu." : ""}
                </td>
              </tr>
            ) : (
              areas.map((row) => (
                <tr key={row.id} className="border-b border-[#1E293B]/60 last:border-0 hover:bg-[#10151F]">
                  <td className="px-4 py-3 font-medium text-[#F1F5F9]">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">{row.code}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{buildingName(row.building_id)}</td>
                  <td className="px-4 py-3 font-mono text-[#94A3B8]">{row.floor}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-[#94A3B8]" title={row.description}>
                    {row.description || "—"}
                  </td>
                  {(isAdmin || buildings.some((b) => b.id === row.building_id)) && (
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Ubah Area" : "Tambah Area"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="area-building" className={labelCls}>Bangunan *</label>
            <select id="area-building" required className={inputCls} value={form.building_id}
              onChange={(e) => setForm({ ...form, building_id: e.target.value })}>
              <option value="" disabled>Pilih bangunan</option>
              {buildings.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="area-name" className={labelCls}>Nama area *</label>
              <input id="area-name" required className={inputCls} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lantai 1" />
            </div>
            <div>
              <label htmlFor="area-code" className={labelCls}>Kode *</label>
              <input id="area-code" required className={inputCls} value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="LT-1" />
            </div>
          </div>
          <div>
            <label htmlFor="area-floor" className={labelCls}>Lantai *</label>
            <input id="area-floor" required type="number" step={1} className={inputCls} value={form.floor}
              onChange={(e) => setForm({ ...form, floor: e.target.value })} />
          </div>
          <div>
            <label htmlFor="area-desc" className={labelCls}>Deskripsi</label>
            <textarea id="area-desc" rows={2} className={inputCls} value={form.description}
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
