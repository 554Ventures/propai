"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "./ui/button";
import { useAuth } from "./auth-provider";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { login, signup } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    console.log("[AuthForm] submit", { mode, email, hasPassword: !!password });
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email, password);
        const returnUrl = searchParams.get('returnUrl') || '/dashboard';
        router.push(returnUrl);
      } else {
        await signup({ name, email, password, organizationName });
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8 shadow-2xl shadow-black/40">
      <h1 className="text-2xl font-semibold text-slate-100">
        {mode === "login" ? "Welcome back" : "Create your PropAI account"}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        {mode === "login"
          ? "Sign in to manage properties, tenants, and cash flow."
          : "Start tracking properties and tenants in minutes."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Name</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Avery Johnson"
              required
            />
          </div>
        )}
        {mode === "signup" && (
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Organization Name</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="554 Ventures"
              required
            />
          </div>
        )}
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@propai.com"
            type="email"
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
          <input
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            type="password"
            required
          />
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <Button className="w-full" disabled={loading}>
          {loading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-slate-400">
        {mode === "login" ? "Need an account?" : "Already have an account?"} {" "}
        <Link
          href={mode === "login" ? "/signup" : "/login"}
          className="text-cyan-300 hover:text-cyan-200"
        >
          {mode === "login" ? "Sign up" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
