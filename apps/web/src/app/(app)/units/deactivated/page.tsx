export default function DeactivatedUnitsPage() {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Deactivated Units</h2>
      <p className="mt-2 text-sm text-slate-400">
        This view is reserved for units that have been deactivated (off-market, sold, or otherwise removed
        from active operations).
      </p>
      <div className="mt-6 rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/40 p-6 text-sm text-slate-300">
        Deactivation support isn’t wired up yet in the API. Once available, this page will list
        deactivated units and allow reactivation.
      </div>
    </div>
  );
}

