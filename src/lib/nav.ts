import type { Role } from "./domain";

export function homeFor(role: Role) {
  if (role === "EMPLOYEE") return "/my";
  if (role === "HANDLER") return "/queue?view=queue";
  return "/pulse";
}
