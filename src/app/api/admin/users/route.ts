import { route } from "@/lib/api";
import { adminOverview } from "@/lib/services/admin";

export const GET = route(async () => {
  const { users, departments } = await adminOverview();
  return { users, departments };
}, { roles: ["ADMIN"] });
