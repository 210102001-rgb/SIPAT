"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Modal } from "@/components/Modal";
import type { Role, SessionUser, UserRow } from "@/lib/types";

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

interface CreateForm {
  username: string;
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface EditForm {
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
}

const EMPTY_CREATE: CreateForm = {
  username: "",
  name: "",
  email: "",
  password: "",
  role: "user",
};

const inputCls =
  "w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-[#94A3B8]";

export default function UsersPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    email: "",
    role: "user",
    status: "active",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = await api<SessionUser>("/api/auth/me");
      setMe(user);
      if (user.role !== "super_admin") {
        setDenied(true);
        return;
      }
      const rows = await api<UserRow[]>("/api/users");
      setUsers(rows);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memuat data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      await api<UserRow>("/api/users", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      setNotice({ kind: "ok", text: `Pengguna "${createForm.username}" berhasil dibuat.` });
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal membuat pengguna" });
    } finally {
      setCreating(false);
    }
  }

  function openEdit(row: UserRow) {
    setEditing(row);
    setEditForm({ name: row.name, email: row.email, role: row.role, status: row.status });
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setNotice(null);
    try {
      await api<UserRow>(`/api/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(editForm),
      });
      setNotice({ kind: "ok", text: "Pengguna berhasil diperbarui." });
      setEditing(null);
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memperbarui pengguna" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleStatus(row: UserRow) {
    const next = row.status === "active" ? "disabled" : "active";
    const verb = next === "disabled" ? "menonaktifkan" : "mengaktifkan";
    if (!window.confirm(`${next === "disabled" ? "Nonaktifkan" : "Aktifkan"} pengguna "${row.username}"?`)) return;
    try {
      await api<UserRow>(`/api/users/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setNotice({ kind: "ok", text: `Pengguna "${row.username}" berhasil ${next === "disabled" ? "dinonaktifkan" : "diaktifkan"}.` });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : `Gagal ${verb} pengguna` });
    }
  }

  async function handleResetPassword(row: UserRow) {
    if (!window.confirm(`Reset password "${row.username}" ke "user123"?`)) return;
    try {
      await api<unknown>(`/api/users/${row.id}/reset-password`, { method: "POST" });
      setNotice({ kind: "ok", text: `Password "${row.username}" direset ke user123.` });
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal mereset password" });
    }
  }

  async function handleDelete(row: UserRow) {
    if (!window.confirm(`Hapus pengguna "${row.username}" secara permanen?`)) return;
    try {
      await api<unknown>(`/api/users/${row.id}`, { method: "DELETE" });
      setNotice({ kind: "ok", text: "Pengguna berhasil dihapus." });
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menghapus pengguna" });
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-[#94A3B8]">Memuat…</p>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-6 text-center">
          <h1 className="text-lg font-bold text-[#F1F5F9]">Akses ditolak</h1>
          <p className="mt-1 text-sm text-[#FCA5A5]">
            Halaman Manajemen User hanya dapat diakses oleh Super Admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#F1F5F9]">Manajemen User</h1>
          <p className="text-sm text-[#94A3B8]">{users.length} akun terdaftar.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9]"
        >
          + Tambah User
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
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Peran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dibuat</th>
              <th className="px-4 py-3">Login Terakhir</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[#94A3B8]">
                  Belum ada pengguna.
                </td>
              </tr>
            ) : (
              users.map((row) => (
                <tr key={row.id} className="border-b border-[#1E293B]/60 last:border-0 hover:bg-[#10151F]">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-[#F1F5F9]">{row.username}</td>
                  <td className="px-4 py-3 text-[#F1F5F9]">{row.name}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{row.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.role === "super_admin"
                          ? "bg-[#22D3EE]/15 text-[#67E8F9]"
                          : "bg-[#64748B]/15 text-[#94A3B8]"
                      }`}
                    >
                      {row.role === "super_admin" ? "Super Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "active"
                          ? "bg-[#22C55E]/15 text-[#86EFAC]"
                          : "bg-[#EF4444]/15 text-[#FCA5A5]"
                      }`}
                    >
                      {row.status === "active" ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">{row.created_at}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">{row.last_login_at ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEdit(row)} aria-label={`Ubah ${row.username}`}
                        className="rounded-md border border-[#1E293B] px-2 py-1 text-xs text-[#F1F5F9] hover:bg-[#10151F]">
                        ✎ Ubah
                      </button>
                      <button type="button" onClick={() => void handleToggleStatus(row)}
                        className="rounded-md border border-[#1E293B] px-2 py-1 text-xs text-[#F1F5F9] hover:bg-[#10151F]">
                        {row.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button type="button" onClick={() => void handleResetPassword(row)}
                        className="rounded-md border border-[#EAB308]/40 px-2 py-1 text-xs text-[#FDE68A] hover:bg-[#EAB308]/10">
                        Reset Password
                      </button>
                      {me?.id !== row.id && (
                        <button type="button" onClick={() => void handleDelete(row)} aria-label={`Hapus ${row.username}`}
                          className="rounded-md border border-[#EF4444]/40 px-2 py-1 text-xs text-[#FCA5A5] hover:bg-[#EF4444]/10">
                          Hapus
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tambah User">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="usr-username" className={labelCls}>Username *</label>
              <input id="usr-username" required className={inputCls} value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} />
            </div>
            <div>
              <label htmlFor="usr-name" className={labelCls}>Nama *</label>
              <input id="usr-name" required className={inputCls} value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="usr-email" className={labelCls}>Email *</label>
            <input id="usr-email" required type="email" className={inputCls} value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="usr-password" className={labelCls}>Password *</label>
              <input id="usr-password" required type="password" minLength={6} className={inputCls} value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </div>
            <div>
              <label htmlFor="usr-role" className={labelCls}>Peran *</label>
              <select id="usr-role" className={inputCls} value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}>
                <option value="user">User</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)}
              className="rounded-md border border-[#1E293B] px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#10151F]">Batal</button>
            <button type="submit" disabled={creating}
              className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50">
              {creating ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Ubah ${editing.username}` : "Ubah User"}>
        <form onSubmit={handleEdit} className="space-y-3">
          <div>
            <label htmlFor="edit-name" className={labelCls}>Nama *</label>
            <input id="edit-name" required className={inputCls} value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="edit-email" className={labelCls}>Email *</label>
            <input id="edit-email" required type="email" className={inputCls} value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-role" className={labelCls}>Peran *</label>
              <select id="edit-role" className={inputCls} value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
                <option value="user">User</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-status" className={labelCls}>Status *</label>
              <select id="edit-status" className={inputCls} value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as "active" | "disabled" })}>
                <option value="active">Aktif</option>
                <option value="disabled">Nonaktif</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-md border border-[#1E293B] px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#10151F]">Batal</button>
            <button type="submit" disabled={savingEdit}
              className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50">
              {savingEdit ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
