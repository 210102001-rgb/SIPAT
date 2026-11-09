"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Modal } from "@/components/Modal";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[240px] w-full items-center justify-center rounded-lg border border-[#1E293B] bg-[#0B0F16] text-sm text-[#94A3B8]">
      Memuat peta…
    </div>
  ),
});
import type { LocationRow, SessionUser } from "@/lib/types";

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

const LOCATION_TYPES = ["Rumah", "Kampus", "Kantor", "Pabrik", "Sekolah", "Lainnya"];

interface LocationForm {
  name: string;
  type: string;
  province: string;
  city: string;
  district: string;
  address: string;
  lat: string;
  lng: string;
  photo_url: string;
  description: string;
}

const EMPTY_FORM: LocationForm = {
  name: "",
  type: "Rumah",
  province: "",
  city: "",
  district: "",
  address: "",
  lat: "",
  lng: "",
  photo_url: "",
  description: "",
};

const inputCls =
  "w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-[#94A3B8]";

export default function LocationsPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = me?.role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, rows] = await Promise.all([
        api<SessionUser>("/api/auth/me"),
        api<LocationRow[]>("/api/locations"),
      ]);
      setMe(user);
      setLocations(rows);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memuat data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoRemoved(false);
    setModalOpen(true);
  }

  function openEdit(row: LocationRow) {
    setEditing(row);
    setPhotoFile(null);
    setPhotoPreview(row.photo_url || null);
    setPhotoRemoved(false);
    setForm({
      name: row.name,
      type: row.type,
      province: row.province,
      city: row.city,
      district: row.district,
      address: row.address,
      lat: String(row.lat),
      lng: String(row.lng),
      photo_url: row.photo_url,
      description: row.description,
    });
    setModalOpen(true);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice({ kind: "err", text: "File harus berupa gambar." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice({ kind: "err", text: "Ukuran foto maksimal 5 MB." });
      return;
    }
    if (photoPreview && photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoRemoved(false);
  }

  function removePhoto() {
    if (photoPreview && photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoRemoved(true);
  }

  async function uploadPhoto(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const body = (await res.json()) as Envelope<{ url: string }>;
    if (!body.ok || !body.data?.url) {
      throw new Error(body.error ?? "Gagal mengunggah foto");
    }
    return body.data.url;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.lat || !form.lng) {
      setNotice({
        kind: "err",
        text: "Pilih lokasi dulu: klik di peta, pakai “Gunakan Lokasi Saya”, atau tempel link Google Maps.",
      });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      let photoUrl = form.photo_url;
      if (photoFile) {
        photoUrl = await uploadPhoto(photoFile);
      } else if (photoRemoved) {
        photoUrl = "";
      }
      const payload = {
        ...form,
        photo_url: photoUrl,
        lat: Number(form.lat),
        lng: Number(form.lng),
      };
      if (editing) {
        await api<LocationRow>(`/api/locations/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Lokasi berhasil diperbarui." });
      } else {
        await api<LocationRow>("/api/locations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice({ kind: "ok", text: "Lokasi berhasil ditambahkan." });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan lokasi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: LocationRow) {
    if (!window.confirm(`Hapus lokasi "${row.name}"? Bangunan, area, dan perangkat di bawahnya ikut terhapus.`)) return;
    try {
      await api<unknown>(`/api/locations/${row.id}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: "Lokasi berhasil dihapus." });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menghapus lokasi" });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#F1F5F9]">Lokasi</h1>
          <p className="text-sm text-[#94A3B8]">
            {isAdmin ? "Semua lokasi dalam sistem." : "Lokasi Anda — tambah, ubah, atau hapus lokasi milik Anda."}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9]"
        >
          + Tambah Lokasi
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
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Kota / Kabupaten</th>
              <th className="px-4 py-3">Alamat</th>
              <th className="px-4 py-3 font-mono">Koordinat</th>
              {isAdmin && <th className="px-4 py-3">Owner ID</th>}
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-[#94A3B8]">
                  Memuat…
                </td>
              </tr>
            ) : locations.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-[#94A3B8]">
                  Belum ada lokasi. Klik “Tambah Lokasi” untuk membuat lokasi pertama.
                </td>
              </tr>
            ) : (
              locations.map((row) => (
                <tr key={row.id} className="border-b border-[#1E293B]/60 last:border-0 hover:bg-[#10151F]">
                  <td className="px-4 py-3 font-medium text-[#F1F5F9]">
                    <div className="flex items-center gap-2">
                      {row.photo_url && (
                        <img src={row.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-[#1E293B] object-cover" />
                      )}
                      <span>{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#94A3B8]">{row.type}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">
                    {row.city}
                    {row.district ? `, ${row.district}` : ""}
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-[#94A3B8]" title={row.address}>
                    {row.address}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">
                    {row.lat}, {row.lng}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">
                      {row.owner_id ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href="/map"
                        className="rounded-md border border-[#1E293B] px-2 py-1 text-xs text-[#22D3EE] hover:bg-[#10151F]"
                      >
                        Peta
                      </Link>
                      {(isAdmin || row.owner_id === me?.id) && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            aria-label={`Ubah ${row.name}`}
                            className="rounded-md border border-[#1E293B] px-2 py-1 text-xs text-[#F1F5F9] hover:bg-[#10151F]"
                          >
                            ✎ Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(row)}
                            aria-label={`Hapus ${row.name}`}
                            className="rounded-md border border-[#EF4444]/40 px-2 py-1 text-xs text-[#FCA5A5] hover:bg-[#EF4444]/10"
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Ubah Lokasi" : "Tambah Lokasi"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="loc-name" className={labelCls}>Nama lokasi *</label>
            <input id="loc-name" required className={inputCls} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Kampus Demo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="loc-type" className={labelCls}>Tipe *</label>
              <select id="loc-type" className={inputCls} value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="loc-province" className={labelCls}>Provinsi</label>
              <input id="loc-province" className={inputCls} value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Jawa Tengah" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="loc-city" className={labelCls}>Kota / Kabupaten</label>
              <input id="loc-city" className={inputCls} value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Surakarta" />
            </div>
            <div>
              <label htmlFor="loc-district" className={labelCls}>Kecamatan</label>
              <input id="loc-district" className={inputCls} value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="Jebres" />
            </div>
          </div>
          <div>
            <label htmlFor="loc-address" className={labelCls}>Alamat</label>
            <textarea id="loc-address" rows={2} className={inputCls} value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Jl. …" />
          </div>
          <div>
            <span className={labelCls}>Lokasi di peta *</span>
            <LocationPicker
              lat={form.lat === "" ? null : Number(form.lat)}
              lng={form.lng === "" ? null : Number(form.lng)}
              onChange={(newLat, newLng) =>
                setForm({ ...form, lat: String(newLat), lng: String(newLng) })
              }
            />
          </div>
          <div>
            <span className={labelCls}>Foto lokasi</span>
            {photoPreview && (
              <div className="mb-2">
                <img src={photoPreview} alt="Foto lokasi" className="h-32 w-full rounded-lg border border-[#1E293B] object-cover" />
                <button type="button" onClick={removePhoto} className="mt-1 text-xs text-[#FCA5A5] hover:underline">
                  Hapus foto
                </button>
              </div>
            )}
            <label htmlFor="loc-photo" className="inline-block cursor-pointer rounded-md border border-[#1E293B] px-3 py-2 text-sm text-[#F1F5F9] hover:bg-[#10151F]">
              {photoPreview ? "Ganti foto…" : "Pilih foto…"}
            </label>
            <input id="loc-photo" type="file" accept="image/*" className="hidden"
              onChange={handlePhotoSelect} />
            <p className="mt-1 text-xs text-[#94A3B8]">JPG, PNG, WebP, atau GIF — maksimal 5 MB.</p>
          </div>
          <div>
            <label htmlFor="loc-desc" className={labelCls}>Deskripsi</label>
            <textarea id="loc-desc" rows={2} className={inputCls} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="rounded-md border border-[#1E293B] px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#10151F]">
              Batal
            </button>
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
