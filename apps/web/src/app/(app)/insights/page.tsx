"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InsightsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the consolidated Analytics & Insights page
    router.replace("/analytics");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <p className="text-sm text-slate-400">Redirecting to Analytics & Insights...</p>
    </div>
  );
}

