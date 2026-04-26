"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/molecules/page-header";
import { DataCard } from "@/components/ui/molecules/data-card";
import { FormField } from "@/components/ui/molecules/form-field";
import { Input } from "@/components/ui/atoms/input";

type PlaidLinkMetadata = {
  institution?: { name?: string | null; institution_id?: string | null } | null;
};

type PlaidLinkHandler = {
  open: () => void;
  destroy: () => void;
};

type PlaidCreateConfig = {
  token: string;
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
  onExit?: (error: { error_message?: string | null } | null, metadata: PlaidLinkMetadata) => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidCreateConfig) => PlaidLinkHandler;
    };
  }
}

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

type PlaidAccount = {
  id: string;
  plaidItemId: string;
  name: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  status: string;
  institutionName?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
};

type PlaidReviewTransaction = {
  id: string;
  name: string;
  merchantName?: string | null;
  amount: number;
  date: string;
  suggestedType: CashflowType;
  suggestedCategory?: string | null;
  categoryConfidence?: number | null;
  reviewReason?: string | null;
  accountName: string;
  accountMask?: string | null;
};

type TabKey = "all" | "income" | "expenses";

function toISODate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getMonthToDateRange(now = new Date()) {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { from: toISODate(start), to: toISODate(end) };
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function friendlyError(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  return fallback;
}

function loadPlaidScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid Link can only run in the browser."));
  }

  if (window.Plaid) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById("plaid-link-script") as HTMLScriptElement | null;
  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Plaid Link failed to load.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "plaid-link-script";
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link failed to load."));
    document.head.appendChild(script);
  });
}

export default function CashflowPage() {
  const [tab, setTab] = useState<TabKey>("all");
  const [transactions, setTransactions] = useState<CashflowTransaction[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<PlaidAccount[]>([]);
  const [reviewTransactions, setReviewTransactions] = useState<PlaidReviewTransaction[]>([]);
  const [reviewEdits, setReviewEdits] = useState<Record<string, { category: string; propertyId: string }>>({});

  const mtd = useMemo(() => getMonthToDateRange(), []);
  const [from, setFrom] = useState(mtd.from);
  const [to, setTo] = useState(mtd.to);
  const [propertyId, setPropertyId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plaidStatus, setPlaidStatus] = useState<string | null>(null);
  const [plaidConnecting, setPlaidConnecting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    type: "EXPENSE" as CashflowType,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    propertyId: "",
    notes: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (propertyId) params.set("propertyId", propertyId);
      if (tab === "income") params.set("type", "income");
      if (tab === "expenses") params.set("type", "expense");

      const [tx, props] = await Promise.all([
        apiFetch<CashflowTransaction[]>(`/cashflow/transactions?${params.toString()}`, { auth: true }),
        apiFetch<Property[]>("/properties", { auth: true }).catch(() => [])
      ]);
      const [accounts, review] = await Promise.all([
        apiFetch<PlaidAccount[]>("/api/plaid/accounts", { auth: true }).catch(() => []),
        apiFetch<PlaidReviewTransaction[]>("/api/plaid/transactions/review", { auth: true }).catch(() => [])
      ]);
      setTransactions(tx);
      setProperties(props);
      setPlaidAccounts(accounts);
      setReviewTransactions(review);
    } catch (err) {
      setError(friendlyError(err, "We couldn't load cashflow transactions."));
    } finally {
      setLoading(false);
    }
  }, [from, propertyId, tab, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === "INCOME")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const expense = transactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { income, expense, net: income - expense };
  }, [transactions]);

  const filtersActive = useMemo(() => {
    return tab !== "all" || propertyId !== "" || from !== mtd.from || to !== mtd.to;
  }, [from, mtd.from, mtd.to, propertyId, tab, to]);

  const clearFilters = () => {
    setTab("all");
    setPropertyId("");
    setFrom(mtd.from);
    setTo(mtd.to);
  };

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
      await apiFetch<CashflowTransaction>("/cashflow/transactions", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload)
      });
      // Re-load so the list stays consistent with the current filters (date range / property / type).
      await load();
      setModalOpen(false);
      resetForm();
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that transaction."));
    } finally {
      setSubmitting(false);
    }
  };

  const startPlaidConnection = async () => {
    if (plaidConnecting) return;

    setPlaidConnecting(true);
    setPlaidStatus(null);
    setError(null);
    try {
      const { linkToken } = await apiFetch<{ linkToken: string }>("/api/plaid/link-token", { method: "POST", auth: true });
      await loadPlaidScript();

      if (!window.Plaid) {
        throw new Error("Plaid Link is unavailable.");
      }

      setPlaidStatus("Opening secure bank connection...");
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (publicToken) => {
          void (async () => {
            setPlaidStatus("Connecting bank account...");
            try {
              const result = await apiFetch<{ itemId: string; accountsImported: number }>("/api/plaid/exchange-public-token", {
                method: "POST",
                auth: true,
                body: JSON.stringify({ publicToken })
              });
              setPlaidStatus(`Connected ${result.accountsImported} account${result.accountsImported === 1 ? "" : "s"}. Syncing transactions...`);
              await apiFetch<{ imported: number; modified: number; removed: number }>(`/api/plaid/items/${result.itemId}/sync`, {
                method: "POST",
                auth: true
              });
              setPlaidStatus("Bank account connected and transactions are ready for review.");
              await load();
            } catch (err) {
              setError(friendlyError(err, "We couldn't finish connecting that bank account."));
            } finally {
              setPlaidConnecting(false);
              handler.destroy();
            }
          })();
        },
        onExit: (plaidError) => {
          if (plaidError?.error_message) {
            setError(plaidError.error_message);
          } else {
            setPlaidStatus(null);
          }
          setPlaidConnecting(false);
          handler.destroy();
        }
      });

      handler.open();
    } catch (err) {
      setError(friendlyError(err, "We couldn't start Plaid Link."));
      setPlaidConnecting(false);
    }
  };

  const syncPlaidItem = async (itemId: string) => {
    setPlaidStatus(null);
    setError(null);
    try {
      const result = await apiFetch<{ imported: number; modified: number; removed: number }>(`/api/plaid/items/${itemId}/sync`, {
        method: "POST",
        auth: true
      });
      setPlaidStatus(`Synced ${result.imported + result.modified} transaction${result.imported + result.modified === 1 ? "" : "s"}.`);
      await load();
    } catch (err) {
      setError(friendlyError(err, "We couldn't sync that bank connection."));
    }
  };

  const updateReviewEdit = (id: string, key: "category" | "propertyId", value: string) => {
    setReviewEdits((prev) => ({
      ...prev,
      [id]: { category: prev[id]?.category ?? "", propertyId: prev[id]?.propertyId ?? "", [key]: value }
    }));
  };

  const approveReviewTransaction = async (transaction: PlaidReviewTransaction) => {
    const edit = reviewEdits[transaction.id];
    const category = edit?.category || transaction.suggestedCategory || "";
    if (!category.trim()) {
      setError("Choose a category before approving this transaction.");
      return;
    }

    setError(null);
    try {
      await apiFetch(`/api/plaid/transactions/${transaction.id}/review`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ category, propertyId: edit?.propertyId || null })
      });
      await load();
    } catch (err) {
      setError(friendlyError(err, "We couldn't approve that imported transaction."));
    }
  };

  const excludeReviewTransaction = async (transactionId: string) => {
    setError(null);
    try {
      await apiFetch(`/api/plaid/transactions/${transactionId}/review`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ exclude: true })
      });
      await load();
    } catch (err) {
      setError(friendlyError(err, "We couldn't exclude that imported transaction."));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow"
        description="Track income & expenses across your portfolio."
        action={
          <Button
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
          >
            Add transaction
          </Button>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">Bank connections</h2>
              <p className="mt-1 text-xs text-muted-foreground">Connected accounts stream imported cashflow for review.</p>
            </div>
            <Button type="button" variant="secondary" onClick={startPlaidConnection} disabled={plaidConnecting}>
              {plaidConnecting ? "Connecting..." : "Connect bank"}
            </Button>
          </div>
          {plaidStatus && <div className="mt-3 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-foreground">{plaidStatus}</div>}
          <div className="mt-4 divide-y divide-border">
            {plaidAccounts.length === 0 ? (
              <div className="py-3 text-sm text-muted-foreground">No bank accounts connected.</div>
            ) : (
              plaidAccounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-card-foreground">{account.name}{account.mask ? ` • ${account.mask}` : ""}</div>
                    <div className="text-xs text-muted-foreground">
                      {account.institutionName ?? account.type ?? "Bank account"} • {account.status.toLowerCase().replaceAll("_", " ")}
                      {account.lastSyncedAt ? ` • Synced ${new Date(account.lastSyncedAt).toLocaleString()}` : ""}
                    </div>
                    {account.lastSyncError && <div className="mt-1 text-xs text-destructive">{account.lastSyncError}</div>}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => syncPlaidItem(account.plaidItemId)}>Sync</Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-card-foreground">Needs review</h2>
              <p className="mt-1 text-xs text-muted-foreground">Assign category and property before approval.</p>
            </div>
            <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{reviewTransactions.length}</div>
          </div>
          <div className="mt-4 space-y-3">
            {reviewTransactions.length === 0 ? (
              <div className="text-sm text-muted-foreground">No imported transactions need review.</div>
            ) : (
              reviewTransactions.slice(0, 3).map((transaction) => {
                const edit = reviewEdits[transaction.id];
                const category = edit?.category ?? transaction.suggestedCategory ?? "";
                return (
                  <div key={transaction.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-card-foreground">{transaction.merchantName ?? transaction.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString()} • {transaction.accountName}{transaction.accountMask ? ` • ${transaction.accountMask}` : ""}
                        </div>
                      </div>
                      <div className={transaction.suggestedType === "INCOME" ? "text-green-500" : "text-red-500"}>{formatMoney(Math.abs(Number(transaction.amount)))}</div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input value={category} onChange={(e) => updateReviewEdit(transaction.id, "category", e.target.value)} placeholder="Category" />
                      <select
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        value={edit?.propertyId ?? ""}
                        onChange={(e) => updateReviewEdit(transaction.id, "propertyId", e.target.value)}
                      >
                        <option value="">No property</option>
                        {properties.map((property) => (
                          <option key={property.id} value={property.id}>{property.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={() => excludeReviewTransaction(transaction.id)}>Exclude</Button>
                      <Button type="button" onClick={() => approveReviewTransaction(transaction)}>Approve</Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

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
                ? "border-primary/50 bg-primary/10 text-primary-foreground"
                : "border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <FormField label="From" className="min-w-[140px]">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </FormField>
        <FormField label="To" className="min-w-[140px]">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </FormField>
        <FormField label="Property" className="min-w-[220px] flex-1">
          <select
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <Button type="button" variant="secondary" onClick={clearFilters} disabled={!filtersActive || loading}>
          Clear filters
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>{error}</div>
            <Button type="button" variant="secondary" onClick={load} disabled={loading}>
              Retry
            </Button>
          </div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <DataCard
          title="Income"
          value={formatMoney(totals.income)}
          size="sm"
        />
        <DataCard
          title="Expenses"
          value={formatMoney(totals.expense)}
          size="sm"
        />
        <DataCard
          title="Net"
          value={formatMoney(totals.net)}
          status={totals.net >= 0 ? "success" : "error"}
          size="sm"
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[140px_1fr_1fr_44px_140px] gap-3 border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
          <div>Date</div>
          <div>Category</div>
          <div>Property</div>
          <div className="text-center">Notes</div>
          <div className="text-right">Amount</div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {filtersActive ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>No transactions match your current filters.</div>
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              "No transactions yet."
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((t) => {
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
                  <div className="text-muted-foreground">{new Date(t.date).toLocaleDateString()}</div>
                  <div className="min-w-0 truncate text-foreground">{t.category}</div>
                  <div className="min-w-0 truncate text-muted-foreground">{propertyName}</div>
                  <div className="flex justify-center">
                    {hasNotes ? (
                      <span
                        title={t.notes ?? undefined}
                        className="inline-flex h-2 w-2 rounded-full bg-primary/80"
                        aria-label="Has notes"
                      />
                    ) : (
                      <span className="inline-flex h-2 w-2 rounded-full bg-muted/60" aria-label="No notes" />
                    )}
                  </div>
                  <div className={`text-right font-medium ${isIncome ? "text-green-500" : "text-red-500"}`}>
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

          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-popover p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-popover-foreground">Add transaction</h3>
                <p className="text-xs text-muted-foreground">Income or expense. Category is free text for now.</p>
              </div>
              <button
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  if (!submitting) setModalOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <form onSubmit={submit} className="mt-6 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Type">
                  <select
                    className="mt-2 w-full rounded-md border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={form.type}
                    onChange={(e) => updateForm("type", e.target.value as CashflowType)}
                  >
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </FormField>
                <FormField label="Amount">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => updateForm("amount", e.target.value)}
                    placeholder="1200.00"
                    required
                  />
                </FormField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Date">
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm("date", e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Category">
                  <Input
                    value={form.category}
                    onChange={(e) => updateForm("category", e.target.value)}
                    placeholder={form.type === "INCOME" ? "Rent" : "Repairs"}
                    required
                  />
                </FormField>
              </div>

              <FormField label="Property (optional)">
                <select
                  className="mt-2 w-full rounded-md border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
              </FormField>

              <FormField label="Notes (optional)">
                <textarea
                  className="mt-2 w-full resize-none rounded-md border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  placeholder="Optional"
                />
              </FormField>

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
