"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface MeResponse {
  user: { id: string; name: string; role: string };
  counters: { mineOpen: number; needsMyAnswer: number; queue: number; overdue: number; noResponse: number };
  unread: number;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<MeResponse>("/api/me"), refetchInterval: 30_000 });
}

export interface Meta {
  categories: { id: string; name: string; description: string }[];
  departments: { id: string; name: string }[];
  staff: { id: string; name: string; title: string; isAvailable: boolean }[];
  sla: Record<"LOW" | "MEDIUM" | "HIGH", { firstResponseHours: number; resolutionDays: number }>;
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/meta"), staleTime: 5 * 60_000 });
}
