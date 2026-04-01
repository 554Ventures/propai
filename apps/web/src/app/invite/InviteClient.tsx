"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setStoredAuth, type AuthUser, type AuthOrg, type OrgRole } from "@/lib/auth";
import { useAuth } from "@/components/auth-provider";

type AcceptInviteResponse = {
  token: string;
  user?: AuthUser | null;
  organization?: AuthOrg | null;
  role?: OrgRole;
};

export default function InviteClient() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenParam = params.get("token");

  const { token: authToken, loading: authLoading } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isLoggedIn = !!authToken;

  const returnUrl = useMemo(() => {
    if (typeof window === "undefined") return "/invite";
    return window.location.pathname + window.location.search;
  }, []);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [tokenParam]);

  const acceptInvite = async (payload: Record<string, unknown>, opts: { auth: boolean }) => {
    const res = await apiFetch<AcceptInviteResponse>("/org/invites/accept", {
      method: "POST",
      auth: opts.auth,
      body: JSON.stringify(payload)
    });

    // If backend returns a JWT, store it so the app can hydrate /auth/me.
    if (res?.token) {
      setStoredAuth(res.token, res.user ?? undefined, res.role ?? null);
    }

    return res;
  };

  const onAcceptLoggedIn = async () => {
    if (!tokenParam) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await acceptInvite({ token: tokenParam }, { auth: true });
      setNotice("Invite accepted. Redirecting…");
      router.push("/dashboard");
    } catch (e: any) {
      setError(e?.message ?? "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateAccountAndAccept = async (evt: React.FormEvent) => {
    evt.preventDefault();
    if (!tokenParam) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await acceptInvite(
        {
          token: tokenParam,
          name: name.trim(),
          email: email.trim(),
          password
        },
        { auth: false }
      );

      setNotice("Account created and invite accepted. Redirecting…");
      // Hard navigate so providers re-hydrate cleanly.
      window.location.href = "/dashboard";
    } catch (e: any) {
      setError(e?.message ?? "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  if (!tokenParam) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-800/70 bg-slate-900/40 p-6 text-slate-100">
        <h1 className="text-xl font-semibold">Invite link invalid</h1>
        <p className="mt-2 text-sm text-slate-400">Missing token. Ask your org admin to resend the invite.</p>
        <div className="mt-4">
          <Link className="text-sm text-cyan-200 underline" href="/login">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/40 p-6 text-slate-100">
      <div>
        <h1 className="text-xl font-semibold">You’ve been invited</h1>
        <p className="mt-2 text-sm text-slate-400">Accept the invitation to join the organization.</p>
      </div>

      {error ? <p className="text-sm text-rose-200">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-200">{notice}</p> : null}

      {authLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : isLoggedIn ? (
        <div className="space-y-3">
          <button
            onClick={onAcceptLoggedIn}
            disabled={submitting}
            className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/70 disabled:opacity-50"
          >
            {submitting ? "Accepting…" : "Accept invite"}
          </button>
          <p className="text-xs text-slate-400">
            Not the right account? <Link href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}>Sign in</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
            <p className="text-sm text-slate-300">
              Already have an account?{" "}
              <Link className="text-cyan-200 underline" href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}>
                Sign in to accept
              </Link>
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-200">Or create an account</h2>
            <form onSubmit={onCreateAccountAndAccept} className="mt-3 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="Email"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                placeholder="Password"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/70 disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create account + accept"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

