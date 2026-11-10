import type { Page } from "@playwright/test";

export const ACC = {
  employee: "employee@pulse.demo",
  handler: "handler@pulse.demo",
  manager: "manager@pulse.demo",
  admin: "admin@pulse.demo",
  buh: "e.smirnova@pulse.demo",
  gromov: "p.gromov@pulse.demo",
  sales: "a.belyaev@pulse.demo",
  coord: "m.kim@pulse.demo",
};

export async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  const res = await page.request.post("/api/auth/login", { data: { email, password: "pulse-demo" } });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
}
