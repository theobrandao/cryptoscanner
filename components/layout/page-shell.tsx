import * as React from "react";
import { cn } from "@/lib/utils";

export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-3 py-5 sm:px-4 sm:py-6", className)}>{children}</div>;
}

export function PageTitle({ title, description, actions, icon }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="flex items-center gap-3 text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[32px]">
          {icon ? (
            <span aria-hidden className="icon-tile grid h-10 w-10 shrink-0 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </span>
          ) : null}
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
