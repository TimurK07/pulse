import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canSeeAnalytics } from "@/lib/permissions";
import { homeFor } from "@/lib/nav";
import { AnalyticsView } from "./analytics-view";

export const metadata: Metadata = { title: "Аналитика" };

// Аналитика доступна обработчикам и руководителям (сотруднику API отвечает 403)
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeAnalytics(user.role)) redirect(homeFor(user.role));
  return (
    <Suspense>
      <AnalyticsView />
    </Suspense>
  );
}
