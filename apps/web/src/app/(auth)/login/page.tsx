import AuthForm from "../../../components/auth-form";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-16 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
      </div>
      <div className="relative flex min-h-screen items-center justify-center px-6">
        <Suspense fallback={<div className="text-sm text-slate-400">Loading...</div>}>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
