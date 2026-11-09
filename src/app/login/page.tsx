"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body: { ok: boolean; error?: string } = await res.json();
      if (!res.ok || !body.ok) {
        setError(
          body.error === "unauthorized"
            ? "Username atau password salah."
            : (body.error ?? "Login gagal. Coba lagi."),
        );
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/sipat-logo-light.png" alt="SIPAT — Sistem Peringatan Gempa Cepat dan Praktis" className="mx-auto w-56 object-contain" />
          <p className="mx-auto mt-4 max-w-xs text-xs leading-relaxed text-muted">
            Cepat merespons, desain tidak rumit — siapa pun bisa langsung
            memasang dan mengoperasikannya tanpa keahlian khusus.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-line bg-panel p-6 shadow-2xl shadow-black/40"
        >
          <h1 className="text-lg font-bold text-ink">Masuk ke SIPAT</h1>
          <p className="mt-1 text-sm text-muted">
            Gunakan akun Super Admin atau User Anda.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <label className="mt-5 block">
            <span className="text-sm font-medium text-ink">Username</span>
            <input
              type="text"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
              placeholder="admin"
              className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm text-ink placeholder:text-slate-600 focus:border-accent focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-ink">Password</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm text-ink placeholder:text-slate-600 focus:border-accent focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Memeriksa…" : "Masuk"}
          </button>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted">
            Simulasi demo — sensor MPU6050 kelas prototipe; PGA bukan magnitudo.
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Akun demo: <span className="font-mono text-ink">demo / demo123</span>
        </p>
      </div>
    </main>
  );
}
