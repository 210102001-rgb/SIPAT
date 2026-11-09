"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser, WarningLevel } from "@/lib/types";
import { ADMIN_MENU, USER_MENU } from "./Sidebar";

// Tab yang sudah ada di bottom nav HP — sisanya masuk ke menu profil header.
const BOTTOM_TAB_HREFS = new Set([
  "/dashboard",
  "/monitoring",
  "/locations",
  "/devices",
  "/map",
  "/reports",
]);

interface TopbarProps {
  user: SessionUser;
}

interface CurrentWarning {
  active: boolean;
  level?: WarningLevel;
  classification?: string;
  pga_gal?: number;
}

const LEVEL_STYLE: Record<WarningLevel, string> = {
  normal: "border-ok/40 bg-ok/10 text-ok",
  waspada: "border-warn/40 bg-warn/10 text-warn",
  siaga: "border-alert/40 bg-alert/10 text-alert",
  bahaya: "border-danger/40 bg-danger/10 text-danger",
};

const LEVEL_LABEL: Record<WarningLevel, string> = {
  normal: "Normal",
  waspada: "Waspada",
  siaga: "Siaga",
  bahaya: "Bahaya",
};

export default function Topbar({ user }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [warning, setWarning] = useState<CurrentWarning>({ active: false });
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Tutup menu profil saat pindah halaman.
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  // Tutup menu profil dengan tombol Escape.
  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen]);

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  // Halaman yang tidak ada di bottom nav HP — ditampilkan di menu profil.
  const menu = user.role === "super_admin" ? ADMIN_MENU : USER_MENU;
  const extraMenu = menu.filter((item) => !BOTTOM_TAB_HREFS.has(item.href));

  useEffect(() => {
    let cancelled = false;

    async function fetchWarning() {
      try {
        const res = await fetch("/api/warnings/current", { cache: "no-store" });
        if (!res.ok) return;
        const body: { ok: boolean; data?: CurrentWarning } = await res.json();
        if (!cancelled && body.ok && body.data) setWarning(body.data);
      } catch {
        // Biarkan badge terakhir; polling berikutnya mencoba lagi.
      }
    }

    fetchWarning();
    const timer = setInterval(fetchWarning, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Tetap arahkan ke login meski request logout gagal.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const level: WarningLevel =
    warning.active && warning.level ? warning.level : "normal";

  return (
    <header className="sticky top-0 z-[1100] flex h-16 items-center gap-3 border-b border-line bg-panel/90 px-4 backdrop-blur md:px-6">
      <a href="/dashboard" className="flex items-center gap-2 md:hidden">
        <img src="/sipat-mark-light.png" alt="Logo SIPAT" className="h-8 w-8 object-contain" />
        <span className="text-base font-extrabold tracking-[0.18em]">
          SI<span className="text-accent">PAT</span>
        </span>
      </a>

      <div className="ml-auto flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${LEVEL_STYLE[level]}`}
          role="status"
          aria-label={`Status peringatan: ${LEVEL_LABEL[level]}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              level === "normal"
                ? "bg-ok"
                : level === "waspada"
                  ? "bg-warn"
                  : level === "siaga"
                    ? "bg-alert"
                    : "bg-danger"
            }`}
          />
          {LEVEL_LABEL[level]}
          {warning.active && typeof warning.pga_gal === "number"
            ? ` · ${warning.pga_gal.toFixed(0)} gal`
            : ""}
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-label={profileOpen ? "Tutup menu profil" : "Buka menu profil"}
            aria-expanded={profileOpen}
            className="flex items-center gap-2.5 rounded-full border border-line bg-panel2 py-1 pl-1 pr-2.5 transition-colors hover:border-accent/60 sm:pr-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
              {initials || "?"}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block max-w-40 truncate text-sm font-medium text-ink">
                {user.name}
              </span>
              <span className="block text-xs text-muted">
                {user.role === "super_admin" ? "Super Admin" : "User"}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`hidden h-4 w-4 text-muted transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setProfileOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
                <div className="flex items-center gap-3 border-b border-line bg-panel2 px-4 py-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/20 text-base font-bold text-accent">
                    {initials || "?"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-xs text-muted">@{user.username}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                    <span className="mt-1 inline-block rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      {user.role === "super_admin" ? "Super Admin" : "User"}
                    </span>
                  </div>
                </div>
                <div className="p-2">
                  <a
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-panel2"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-muted" aria-hidden="true">
                      <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    Profil Saya
                  </a>
                  {extraMenu.length > 0 && (
                    <>
                      <div className="mx-3 my-2 border-t border-line" />
                      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Menu Lainnya
                      </p>
                      {extraMenu.map((item) => {
                        const active =
                          pathname === item.href ||
                          (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                        return (
                          <a
                            key={item.href}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setProfileOpen(false)}
                            className={`block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-panel2 ${
                              active ? "font-semibold text-accent" : "font-medium text-ink"
                            }`}
                          >
                            {item.label}
                          </a>
                        );
                      })}
                    </>
                  )}
                  <div className="mx-3 my-2 border-t border-line" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                      <path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m-3-3 3-3m0 0-3 3m3-3H9" />
                    </svg>
                    {loggingOut ? "Keluar…" : "Keluar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
