import Link from "next/link";
import { BookA } from "lucide-react";
import { glossaryPath, type GlossaryTerm } from "@/lib/content/glossary";

/** Lista curta de termos do glossário ("Termos desta aula" / "Termos usados"), cada um com link para /glossario#id. */
export function GlossaryTerms({ terms, title, id }: { terms: GlossaryTerm[]; title: string; id: string }) {
  if (!terms.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
        <BookA className="h-4 w-4 text-primary" aria-hidden /> {title}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {terms.map((t) => (
          <li key={t.id}>
            <Link href={glossaryPath(t.id)} className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground">
              {t.term}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
