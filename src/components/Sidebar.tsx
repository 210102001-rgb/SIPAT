"use client";

import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/types";

interface SidebarProps {
  user: SessionUser;
}

export interface MenuItem {
  href: string;
  label: string;
}

export const ADMIN_MENU: MenuItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/locations", label: "Lokasi" },
  { href: "/buildings", label: "Bangunan & Area" },
  { href: "/devices", label: "Perangkat" },
  { href: "/scenario", label: "Kontrol Skenario" },
  { href: "/history", label: "Riwayat" },
  { href: "/map", label: "Peta" },
  { href: "/reports", label: "Laporan" },
  { href: "/users", label: "Manajemen User" },
];

export const USER_MENU: MenuItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/locations", label: "Lokasi Saya" },
  { href: "/devices", label: "Perangkat" },
  { href: "/history", label: "Riwayat" },
  { href: "/map", label: "Peta" },
  { href: "/reports", label: "Laporan" },
];

function SidebarLink({ href, label }: MenuItem) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "block rounded-lg border-l-2 border-accent bg-panel2 px-3 py-2 text-sm font-semibold text-ink"
          : "block rounded-lg border-l-2 border-transparent px-3 py-2 text-sm text-muted transition-colors hover:bg-panel2 hover:text-ink"
      }
    >
      {label}
    </a>
  );
}

export default function Sidebar({ user }: SidebarProps) {
  const menu = user.role === "super_admin" ? ADMIN_MENU : USER_MENU;

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-panel md:flex">
      <div className="border-b border-line px-5 py-5">
        <a href="/dashboard" className="flex items-center gap-2.5">
          <img src="/sipat-mark-light.png" alt="Logo SIPAT" className="h-10 w-10 shrink-0 object-contain" />
          <span>
            <span className="block text-xl font-extrabold tracking-[0.18em] text-ink">
              SI<span className="text-accent">PAT</span>
            </span>
            <span className="mt-0.5 block text-[11px] font-medium tracking-wide text-muted">
              Sistem Peringatan Gempa Cepat dan Praktis
            </span>
          </span>
        </a>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">
          Menu
        </p>
        <ul className="space-y-1">
          {menu.map((item) => (
            <li key={item.href}>
              <SidebarLink href={item.href} label={item.label} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line px-5 py-4">
        <p className="truncate text-sm font-medium text-ink">{user.name}</p>
        <p className="text-xs text-muted">
          {user.role === "super_admin" ? "Super Admin" : "User"}
        </p>
        <p className="mt-2 rounded-md border border-line bg-panel2 px-2 py-1 text-[11px] leading-snug text-muted">
          Simulasi demo — sensor MPU6050 kelas prototipe; PGA bukan magnitudo.
        </p>
      </div>
    </aside>
  );
}
