import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isManagerial } from "@/lib/permissions";
import { homeFor } from "@/lib/nav";
import { PulseView } from "./pulse-view";

export const metadata: Metadata = { title: "Пульс" };

// Пульс — рабочий экран руководителя: остальные роли попадают на свою главную
export default async function PulsePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isManagerial(user.role)) redirect(homeFor(user.role));
  return <PulseView />;
}
