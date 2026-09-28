"use client";

import * as React from "react";
import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { swrFetcher } from "@/lib/client-api";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 2000 }}>
      <ThemeProvider>
        <ToastProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
