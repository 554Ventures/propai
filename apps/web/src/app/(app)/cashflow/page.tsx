"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Property = {
  id: string;
  name: string;
};

type CashflowType = "INCOME" | "EXPENSE";

type CashflowTransaction = {
  id: string;
  type: CashflowType;
  amount: number;
  date: string;
  category: string;
  notes?: string | null;
  propertyId?: string | null;
  property?: { id: string; name: string } | null;
};

type TabKey = "all" | "income" | "expenses";

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function friendlyError(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function CashflowPage() {
  const [tab, setTab] = useState<TabKey>("all");
  const [transactions, setTransactions] = useState<CashflowTransaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    type: "EXPENSE" as CashflowType,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    propertyId: "",
    notes: ""
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [tx, props] = await Promise.all([
          apiFetch<CashflowTransaction[]>("/cashflow/transactions", { auth: true }),
          apiFetch<Property[]>("/properties", { auth: true }).catch(() => [])
        ]);
        setTransactions(tx);
        setProperties(props);
      } catch (err) {
        setError(friendlyError(err, "We couldn't load cashflow transactions."));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const filtered = useMemo(() => {
    if (tab === "income") return transactions.filter((t) => t.type === "INCOME");
    if (tab === "expenses") return transactions.filter((t) => t.type === "EXPENSE");
    return transactions;
  }, [tab, transactions]);

  const updateForm = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      type: "EXPENSE",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      category: "",
      propertyId: "",
      notes: ""
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        category: form.category,
        propertyId: form.propertyId || undefined,
        notes: form.notes || undefined
      };
      const created = await apiFetch<CashflowTransaction>("/cashflow/transactions", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload)
      });
      setTransactions((prev) => [created, ...prev]);
      setModalOpen(false);
      resetForm();
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that transaction."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Cashflow</h2>
          <p className="text-sm text-slate-400">Track income & expenses across your portfolio.</p>
        </div>

        <Button
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
        >
          Add transaction
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "all" as const, label: "All" },
            { key: "income" as const, label: "Income" },
            { key: "expenses" as const, label: "Expenses" }
          ] satisfies { key: TabKey; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            className={`rounded-xl border px-3 py-2 text-sm transition ${
              tab === item.key
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                : "border-slate-800/70 bg-slate-950/40 text-slate-200 hover:border-slate-600/70"
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-800/70 bg-slate-950/40">
        <div className="grid grid-cols-[140px_1fr_1fr_44px_140px] gap-3 border-b border-slate-800/70 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
          <div>Date</div>
          <div>Category</div>
          <div>Property</div>
          <div className="text-center">Notes</div>
          <div className="text-right">Amount</div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-400">Loading transactions...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400">No transactions yet.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filtered.map((t) => {
              const isIncome = t.type === "INCOME";
              const signed = isIncome ? Math.abs(t.amount) : -Math.abs(t.amount);
              const amountLabel = `${signed >= 0 ? "+" : "-"}${formatMoney(Math.abs(signed))}`;
              const propertyName = t.property?.name ?? properties.find((p) => p.id === t.propertyId)?.name ?? "—";
              const hasNotes = Boolean(t.notes && t.notes.trim().length);
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-[140px_1fr_1fr_44px_140px] items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="text-slate-300">{new Date(t.date).toLocaleDateString()}</div>
                  <div className="min-w-0 truncate text-slate-100">{t.category}</div>
                  <div className="min-w-0 truncate text-slate-300">{propertyName}</div>
                  <div className="flex justify-center">
                    {hasNotes ? (
                      <span
                        title={t.notes ?? undefined}
                        className="inline-flex h-2 w-2 rounded-full bg-cyan-300/80"
                        aria-label="Has notes"
                      />
                    ) : (
                      <span className="inline-flex h-2 w-2 rounded-full bg-slate-700/60" aria-label="No notes" />
                    )}
                  </div>
                  <div className={`text-right font-medium ${isIncome ? "text-emerald-300" : "text-rose-300"}`}>
                    {amountLabel}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              if (!submitting) setModalOpen(false);
            }}
          />

          <div className="relative w-full max-w-lg rounded-3xl border border-slate-700/70 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Add transaction</h3>
                <p className="text-xs text-slate-400">Income or expense. Category is free text for now.</p>
              </div>
              <button
                className="rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
                onClick={() => {
                  if (!submitting) setModalOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Type</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={form.type}
                    onChange={(e) => updateForm("type", e.target.value as CashflowType)}
                  >
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Amount</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={form.amount}
                    onChange={(e) => updateForm("amount", e.target.value)}
                    placeholder="1200.00"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Date</label>
                  <input
                    type="date"
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={form.date}
                    onChange={(e) => updateForm("date", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-400">Category</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                    value={form.category}
                    onChange={(e) => updateForm("category", e.target.value)}
                    placeholder={form.type === "INCOME" ? "Rent" : "Repairs"}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Property (optional)</label>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  value={form.propertyId}
                  onChange={(e) => updateForm("propertyId", e.target.value)}
                >
                  <option value="">No property</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-slate-400">Notes (optional)</label>
                <textarea
                  className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!submitting) {
                      setModalOpen(false);
                      resetForm();
                    }
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
