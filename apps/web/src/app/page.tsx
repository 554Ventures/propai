'use client';

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/ui/button";
import { useAuth } from "../components/auth-provider";

export default function HomePage() {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait for auth to load
    if (token) {
      router.push('/dashboard');
    }
  }, [token, loading, router]);

  if (loading || token) {
    return null; // Prevent flash while loading or redirecting
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-16 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-300/70">PropAI</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
          Run your property portfolio like a mission control room.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Track properties, tenants, and rent performance with real-time intelligence. Built for independent
          property managers who want clarity without chaos.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button asChild>
            <Link href="/properties">Go to Properties</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
