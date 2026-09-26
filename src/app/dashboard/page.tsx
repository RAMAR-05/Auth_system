"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type DashboardUser = {
  name: string;
  email: string;
  image: string | null;
};

type ProtectedResponse = {
  success?: boolean;
  user?: DashboardUser;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<DashboardUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/protected", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        console.log("Protected response:", response.status);

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();

          console.error("Protected endpoint status:", response.status);
          console.error("Protected endpoint response:", errorText);

          return;
        }

        const data: ProtectedResponse = await response.json();

        console.log("Protected data:", data);

        if (!cancelled && data.user) {
          setUser({
            name: data.user.name,
            email: data.user.email,
            image: data.user.image ?? null,
          });
        }
      } catch (error) {
        console.error("Dashboard request failed:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        router.replace("/login");
        router.refresh();
        return;
      }
    } catch {
      // Keep the UI generic. Do not expose server details.
    }

    setLoggingOut(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7faf8]">
        <div className="flex flex-col items-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"
            aria-label="Loading"
          />
          <p className="mt-4 text-sm font-medium text-slate-500">
            Loading dashboard...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "U";

  return (
    <main className="min-h-screen bg-[#f7faf8] text-slate-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/20 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white">
              A
            </div>

            <div>
              <p className="font-bold text-slate-900">AuthSpace</p>
              <p className="text-xs text-slate-400">Workspace</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 lg:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-4 py-6">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Main
          </p>

          <div className="mt-3 space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
            >
              <span>⌂</span>
              Dashboard
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
            >
              <span>✓</span>
              Tasks
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
            >
              <span>□</span>
              Calendar
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
            >
              <span>◫</span>
              Analytics
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
            >
              <span>♧</span>
              Team
            </button>
          </div>

          <p className="mt-10 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            General
          </p>

          <div className="mt-3 space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
            >
              <span>⚙</span>
              Settings
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
            >
              <span>?</span>
              Help
            </button>
          </div>
        </nav>

        <div className="border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingOut ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-red-500" />
            ) : (
              <span>↪</span>
            )}

            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-h-screen lg:pl-72">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
            {/* Hamburger */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 lg:hidden"
            >
              ☰
            </button>

            {/* Desktop spacing */}
            <div className="hidden lg:block">
              <p className="text-sm font-medium text-slate-500">Overview</p>
              <h1 className="text-lg font-semibold text-slate-900">
                Dashboard
              </h1>
            </div>

            {/* Right side */}
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                aria-label="Notifications"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              >
                ♧
              </button>

              <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                    {initial}
                  </div>
                )}

                <div className="hidden sm:block">
                  <p className="max-w-40 truncate text-sm font-semibold text-slate-900">
                    {user.name}
                  </p>

                  <p className="max-w-52 truncate text-xs text-slate-500">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Empty dashboard */}
        <section className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8">
              <p className="text-sm font-medium text-emerald-600">
                Welcome back, {user.name}
              </p>

              <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                Your dashboard
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Your workspace is ready.
              </p>
            </div>

            <div className="flex min-h-105 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">
                  ✓
                </div>

                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  Nothing here yet
                </h3>

                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  Your dashboard content will be added here later.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
