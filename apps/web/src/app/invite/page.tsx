import { Suspense } from "react";
import InviteClient from "./InviteClient";

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-800/70 bg-slate-900/40 p-6 text-slate-100">
          <p className="text-sm text-slate-400">Loading invite…</p>
        </div>
      }
    >
      <InviteClient />
    </Suspense>
  );
}

