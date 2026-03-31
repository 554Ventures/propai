"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { useAuth } from "./auth-provider";
import ChatWidget from "./chat-widget";
import { openChat } from "../lib/chat-events";

const navItems = [
  { href: "/dashboard", label: "Dashboard", type: "link" as const },
  { href: "/properties", label: "Properties", type: "link" as const },
  { href: "/tenants", label: "Tenants", type: "link" as const },
  { href: "/leases", label: "Leases", type: "link" as const },
  { href: "/expenses", label: "Expenses", type: "link" as const },
  { href: "/analytics", label: "Analytics", type: "link" as const },
  { href: "/documents", label: "Documents", type: "link" as const },
  { label: "AI Assistant ✨", type: "action" as const }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = useMemo(() => {
    if (!user) return "U";
    if (user.name) {
      return user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    return user.email.slice(0, 2).toUpperCase();
  }, [user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-32 left-10 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-12 pt-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">PropAI</p>
            <h1 className="text-2xl font-semibold">Portfolio Control Center</h1>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  className="flex items-center gap-3 rounded-full border border-slate-700/60 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-cyan-400/70"
                  onClick={() => setMenuOpen((prev) => !prev)}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/20 text-xs font-semibold text-cyan-200">
                    {initials}
                  </span>
                  <span className="hidden text-left md:block">
                    <span className="block text-xs text-slate-400">Signed in as</span>
                    <span className="block text-sm">{user.name ?? user.email}</span>
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-slate-700/70 bg-slate-950/90 p-2 text-sm shadow-xl">
                    <div className="px-3 py-2 text-xs text-slate-400">Account</div>
                    <div className="px-3 pb-2 text-sm text-slate-200">{user.email}</div>
                    <button
                      className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-200 transition hover:bg-rose-500/10"
                      onClick={logout}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </header>

        <nav className="mt-8 flex flex-wrap gap-3">
          {navItems.map((item) => {
            if (item.type === "action") {
              return (
                <button
                  key={item.label}
                  onClick={openChat}
                  className="rounded-full border border-indigo-300/40 bg-gradient-to-r from-indigo-500/20 via-slate-900/60 to-cyan-500/20 px-4 py-2 text-sm text-indigo-100 transition hover:border-cyan-300/70"
                >
                  {item.label}
                </button>
              );
            }

            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-700/60 bg-slate-900/50 text-slate-300 hover:border-slate-500/70"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="mt-10 flex-1 rounded-3xl border border-slate-800/70 bg-slate-900/40 p-6 shadow-2xl shadow-black/40">
          {children}
        </main>
        {user && <ChatWidget />}
      </div>
    </div>
  );
}
