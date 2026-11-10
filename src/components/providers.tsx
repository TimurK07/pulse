"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { Tooltip } from "radix-ui";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: (count, err) => count < 2 && !(err as { status?: number }).status?.toString().startsWith("4"), refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
        {children}
      </Tooltip.Provider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "!bg-raised !text-ink !border-line !rounded-pop !font-sans !text-ui !shadow-[var(--shadow-pop)]",
        }}
      />
    </QueryClientProvider>
  );
}
