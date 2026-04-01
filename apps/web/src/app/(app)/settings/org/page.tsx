"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import type { OrgRole } from "@/lib/auth";

type PendingInvite = {
  id: string;
  email: string;
  role: OrgRole;
  createdAt?: string;
};

export default function OrgSettingsPage() {
  const { org, role } = useAuth();

  const canManageInvites = role === "OWNER" || role === "ADMIN";

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("MEMBER");

  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const title = useMemo(() => (org?.name ? `Org Settings — ${org.name}` : "Org Settings"), [org?.name]);

  const loadInvites = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      // Prefer a simple GET /org/invites; tolerate server variants.
      const res = await apiFetch<{ invites: PendingInvite[] } | PendingInvite[]>("/org/invites");
      const invites = Array.isArray(res) ? res : res.invites;
      setPending(invites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load invites");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageInvites) {
      setLoading(false);
      return;
    }
    loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageInvites]);

  const onCreateInvite = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await apiFetch("/org/invites", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role: inviteRole })
      });
      setEmail("");
      setNotice("Invite sent.");
      await loadInvites();
    } catch (e: any) {
      setError(e?.message ?? "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  const onRevoke = async (inviteId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/org/invites/${inviteId}`, { method: "DELETE" });
      setNotice("Invite revoked.");
      await loadInvites();
    } catch (e: any) {
      setError(e?.message ?? "Failed to revoke invite");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">
          Manage organization access. Only Owners and Admins can invite new members.
        </p>
      </div>

      {!canManageInvites ? (
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
          <p className="text-sm text-slate-300">
            You don’t have permission to manage org settings. Ask an Owner/Admin if you need access.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
            <h3 className="text-sm font-semibold text-slate-200">Invite a teammate</h3>
            <form onSubmit={onCreateInvite} className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="email@company.com"
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-400/70 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send invite"}
              </button>
            </form>
            {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
            {notice ? <p className="mt-3 text-sm text-emerald-200">{notice}</p> : null}
          </section>

          <section className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Pending invites</h3>
              <button
                onClick={loadInvites}
                className="text-xs text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-slate-200"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-slate-400">Loading…</p>
            ) : pending.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No pending invites.</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-800/70">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/40 text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((inv) => (
                      <tr key={inv.id} className="border-t border-slate-800/70">
                        <td className="px-4 py-3 text-slate-200">{inv.email}</td>
                        <td className="px-4 py-3 text-slate-300">{inv.role}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => onRevoke(inv.id)}
                            className="rounded-lg px-3 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/10"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
