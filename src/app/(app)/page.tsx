import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { homeFor } from "@/lib/nav";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homeFor(user.role));
}
