import type { TutorialIcon } from "@/lib/content/tutorials";
import { cn } from "@/lib/utils";
import { TutorialIconView } from "./tutorial-icon";

/** Espaço reservado quando o tutorial ainda não tem imagem: ícone da ferramenta sobre a superfície do DS (sem imagem quebrada). */
export function MediaPlaceholder({ icon, label, className, compact }: { icon: TutorialIcon; label?: string; className?: string; compact?: boolean }) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-muted/40 bg-[radial-gradient(rgba(148,163,184,.14)_1px,transparent_1px)] bg-size-[16px_16px]", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className={cn("icon-tile grid place-items-center rounded-xl", compact ? "h-11 w-11 [&>svg]:h-5 [&>svg]:w-5" : "h-14 w-14 [&>svg]:h-7 [&>svg]:w-7")}>
          <TutorialIconView icon={icon} />
        </span>
        {!compact ? <span className="text-xs text-muted-foreground">Imagens deste tutorial em breve</span> : null}
      </div>
    </div>
  );
}
