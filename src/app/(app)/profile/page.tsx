"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

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

interface ProfileData {
  username: string;
  name: string;
  email: string;
  role: string;
}

const inputCls =
  "w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-[#94A3B8]";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [notifySound, setNotifySound] = useState(false);
  const [notifyBrowser, setNotifyBrowser] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ProfileData>("/api/profile");
      setProfile(data);
      setName(data.name);
      setEmail(data.email);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal memuat profil" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setNotifySound(window.localStorage.getItem("seismora_notify_sound") === "1");
    setNotifyBrowser(window.localStorage.getItem("seismora_notify_browser") === "1");
  }, []);

  function toggleSound(value: boolean) {
    setNotifySound(value);
    window.localStorage.setItem("seismora_notify_sound", value ? "1" : "0");
  }

  function toggleBrowser(value: boolean) {
    setNotifyBrowser(value);
    window.localStorage.setItem("seismora_notify_browser", value ? "1" : "0");
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setNotice(null);
    try {
      const data = await api<ProfileData>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, email }),
      });
      setProfile(data);
      setNotice({ kind: "ok", text: "Profil berhasil diperbarui." });
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan profil" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setNotice({ kind: "err", text: "Password baru minimal 6 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ kind: "err", text: "Konfirmasi password baru tidak cocok." });
      return;
    }
    setSavingPassword(true);
    setNotice(null);
    try {
      await api<unknown>("/api/profile/password", {
        method: "POST",
        body: JSON.stringify({ current: currentPassword, new: newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({ kind: "ok", text: "Password berhasil diubah." });
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Gagal mengubah password" });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-[#F1F5F9]">Profil</h1>
        <p className="text-sm text-[#94A3B8]">Kelola data akun dan preferensi notifikasi Anda.</p>
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

      {loading ? (
        <p className="text-sm text-[#94A3B8]">Memuat…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#1E293B] bg-[#0B0F16] p-5">
            <h2 className="mb-4 text-base font-semibold text-[#F1F5F9]">Data Akun</h2>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div>
                <label htmlFor="profile-username" className={labelCls}>Username</label>
                <input id="profile-username" className={`${inputCls} opacity-60`} value={profile?.username ?? ""} disabled />
              </div>
              <div>
                <label htmlFor="profile-role" className={labelCls}>Peran</label>
                <input id="profile-role" className={`${inputCls} opacity-60`} value={profile?.role ?? ""} disabled />
              </div>
              <div>
                <label htmlFor="profile-name" className={labelCls}>Nama *</label>
                <input id="profile-name" required className={inputCls} value={name}
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="profile-email" className={labelCls}>Email *</label>
                <input id="profile-email" required type="email" className={inputCls} value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button type="submit" disabled={savingProfile}
                className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50">
                {savingProfile ? "Menyimpan…" : "Simpan Profil"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-[#1E293B] bg-[#0B0F16] p-5">
            <h2 className="mb-4 text-base font-semibold text-[#F1F5F9]">Ubah Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label htmlFor="pw-current" className={labelCls}>Password saat ini *</label>
                <input id="pw-current" required type="password" autoComplete="current-password" className={inputCls}
                  value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div>
                <label htmlFor="pw-new" className={labelCls}>Password baru (min. 6 karakter) *</label>
                <input id="pw-new" required type="password" autoComplete="new-password" minLength={6} className={inputCls}
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div>
                <label htmlFor="pw-confirm" className={labelCls}>Konfirmasi password baru *</label>
                <input id="pw-confirm" required type="password" autoComplete="new-password" minLength={6} className={inputCls}
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={savingPassword}
                className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#05070B] hover:bg-[#67E8F9] disabled:opacity-50">
                {savingPassword ? "Menyimpan…" : "Ubah Password"}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-[#1E293B] bg-[#0B0F16] p-5">
            <h2 className="mb-4 text-base font-semibold text-[#F1F5F9]">Notifikasi</h2>
            <p className="mb-3 text-xs text-[#94A3B8]">Preferensi ini disimpan di perangkat ini saja.</p>
            <label className="mb-3 flex cursor-pointer items-center gap-3 text-sm text-[#F1F5F9]">
              <input
                type="checkbox"
                checked={notifySound}
                onChange={(e) => toggleSound(e.target.checked)}
                className="h-4 w-4 accent-[#22D3EE]"
              />
              Bunyi alarm saat peringatan (siaga / bahaya)
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-[#F1F5F9]">
              <input
                type="checkbox"
                checked={notifyBrowser}
                onChange={(e) => toggleBrowser(e.target.checked)}
                className="h-4 w-4 accent-[#22D3EE]"
              />
              Notifikasi browser saat peringatan
            </label>
          </section>

          <section className="rounded-xl border border-[#1E293B] bg-[#0B0F16] p-5">
            <h2 className="mb-4 text-base font-semibold text-[#F1F5F9]">Sesi</h2>
            <p className="mb-3 text-sm text-[#94A3B8]">
              Keluar dari akun {profile?.username ? `“${profile.username}”` : ""} di perangkat ini.
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-2 text-sm font-semibold text-[#FCA5A5] hover:bg-[#EF4444]/20"
            >
              Keluar (Logout)
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
