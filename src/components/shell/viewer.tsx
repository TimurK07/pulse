"use client";
import { createContext, useContext } from "react";
import type { Role } from "@/lib/domain";

export interface Viewer {
  id: string;
  name: string;
  title: string;
  role: Role;
  department: string | null;
}

const Ctx = createContext<Viewer | null>(null);
export const ViewerProvider = Ctx.Provider;
export function useViewer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViewer вне AppShell");
  return v;
}
export const isStaffRole = (r: Role) => r !== "EMPLOYEE";
export const isManagerRole = (r: Role) => r === "MANAGER" || r === "ADMIN";
