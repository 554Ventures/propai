"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy route.
 *
 * We moved Expenses under Cashflow (income + expenses) to support analytics, prediction, and taxes.
 */
export default function ExpensesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/cashflow");
  }, [router]);

  return null;
}

/*
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Property = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  propertyId: string;
  amount: number;
  category: string;
  date: string;
  notes?: string | null;
  vendor?: { name?: string | null } | null;
};

type Categorization = {
  category: string;
  confidence: number;
  reasoning: string;
  insightId: string;
  allowedCategories?: string[];
};

const fallbackCategories = [
  "Mortgage",
  "Insurance",
  "Utilities",
  "Repairs",
  "Maintenance",
  "Taxes",
  "HOA",
  "Supplies",
  "Landscaping",
  "Cleaning",
  "Marketing",
  "Legal",
  "Travel",
  "Office",
  "Payroll",
  "Other"
];

export default function ExpensesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [form, setForm] = useState({
    description: "",
    amount: "",
    vendor: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    notes: ""
  });
  const [suggestion, setSuggestion] = useState<Categorization | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const categories = useMemo(() => suggestion?.allowedCategories ?? fallbackCategories, [suggestion]);

  useEffect(() => {
    const load = async () => {
      setLoadingProperties(true);
      try {
        const data = await apiFetch<Property[]>("/properties", { auth: true });
        setProperties(data);
        if (data.length && !selectedProperty) {
          setSelectedProperty(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load properties.");
      } finally {
        setLoadingProperties(false);
      }
    };
    void load();
  }, [selectedProperty]);

  useEffect(() => {
    const loadExpenses = async () => {
      if (!selectedProperty) return;
      setLoadingExpenses(true);
      try {
        const data = await apiFetch<Expense[]>(`/api/expenses?propertyId=${selectedProperty}`, {
          auth: true
        });
        setExpenses(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load expenses.");
      } finally {
        setLoadingExpenses(false);
      }
    };
    void loadExpenses();
  }, [selectedProperty]);

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const requestSuggestion = async () => {
    if (!form.description || !form.amount) {
      setError("Add a description and amount first.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await apiFetch<Categorization>("/api/expenses/categorize", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          description: form.description,
          amount: Number(form.amount),
          vendor: form.vendor,
          propertyId: selectedProperty
        })
      });
      setSuggestion(data);
      updateForm("category", data.category);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to categorize expense");
    } finally {
      setLoading(false);
    }
  };

  const submitExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProperty) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        propertyId: selectedProperty,
        amount: Number(form.amount),
        category: form.category,
        date: form.date,
        notes: form.notes || undefined,
        vendorName: form.vendor || undefined,
        aiInsightId: suggestion?.insightId
      };
      const created = await apiFetch<Expense>("/api/expenses", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload)
      });

      setExpenses((prev) => [created, ...prev]);
      setSuccess("Expense logged with AI insight.");
      setForm({
        description: "",
        amount: "",
        vendor: "",
        date: new Date().toISOString().slice(0, 10),
        category: "",
        notes: ""
      });
      setSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Expense Categorization</h2>
            <p className="text-sm text-slate-400">Capture expenses and let AI suggest the right category.</p>
          </div>
          <select
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
            value={selectedProperty}
            onChange={(event) => setSelectedProperty(event.target.value)}
            disabled={loadingProperties || properties.length === 0}
          >
            {loadingProperties && <option value="">Loading properties...</option>}
            {!loadingProperties && properties.length === 0 && (
              <option value="">Add a property to log expenses</option>
            )}
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>

        <form
          onSubmit={submitExpense}
          className="mt-6 grid gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6"
        >
          {!loadingProperties && properties.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700/70 p-4 text-sm text-slate-400">
              Add a property before logging expenses so we can tie costs to your portfolio.
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Description</label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              placeholder="AC repair visit"
              required
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Amount</label>
              <input
                type="number"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="120"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Vendor</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                value={form.vendor}
                onChange={(event) => updateForm("vendor", event.target.value)}
                placeholder="City Electric"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Date</label>
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                value={form.date}
                onChange={(event) => updateForm("date", event.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Category</label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                required
              >
                <option value="">Select category</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Notes</label>
              <input
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100"
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={requestSuggestion} disabled={loading}>
              {loading ? "Analyzing..." : "Suggest category"}
            </Button>
            <Button type="submit" disabled={loading || !form.category || !selectedProperty}>
              {loading ? "Saving..." : "Save expense"}
            </Button>
          </div>

          {suggestion && (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">AI suggestion: {suggestion.category}</p>
                  <p className="text-xs text-cyan-200/80">Confidence: {(suggestion.confidence * 100).toFixed(0)}%</p>
                </div>
                <span className="rounded-full border border-cyan-400/50 px-3 py-1 text-xs uppercase tracking-wide text-cyan-200">
                  Insight ready
                </span>
              </div>
              <p className="mt-2 text-cyan-100/80">{suggestion.reasoning}</p>
            </div>
          )}

          {error && <p className="text-sm text-rose-300">{error}</p>}
          {success && <p className="text-sm text-emerald-300">{success}</p>}
        </form>
      </section>

      <section>
        <h3 className="text-lg font-semibold">Recent Expenses</h3>
        <div className="mt-4 space-y-3">
          {loadingExpenses && <p className="text-sm text-slate-400">Loading expenses...</p>}
          {!loadingExpenses && expenses.length === 0 && (
            <p className="text-sm text-slate-400">No expenses yet.</p>
          )}
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{expense.category}</p>
                  <p className="text-xs text-slate-400">{new Date(expense.date).toLocaleDateString()}</p>
                </div>
                <p className="text-sm text-emerald-300">${expense.amount.toFixed(2)}</p>
              </div>
              {expense.vendor?.name && (
                <p className="mt-2 text-xs text-slate-400">Vendor: {expense.vendor.name}</p>
              )}
              {expense.notes && <p className="mt-2 text-xs text-slate-400">{expense.notes}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

*/
