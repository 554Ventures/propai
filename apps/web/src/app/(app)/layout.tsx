'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../components/auth-provider';
import AppShell from "../../components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait for auth to load before checking
    if (loading) return;
    
    // Guard all (app) routes behind a valid JWT token.
    if (!token) {
      const returnUrl = encodeURIComponent(pathname);
      router.push(`/login?returnUrl=${returnUrl}`);
    }
  }, [token, loading, router, pathname]);

  // Show nothing while loading auth
  if (loading) {
    return null;
  }

  // Show nothing if not authenticated (will redirect)
  if (!token) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
