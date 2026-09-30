import * as React from "react";

/**
 * Renderizador mínimo de Markdown para as respostas do Analista IA: parágrafos, listas (- ou 1.),
 * negrito (**), itálico (_), código inline (`), títulos (#) e tabelas simples (| a | b |). Sem HTML.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${keyBase}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${keyBase}-${i++}`} className="rounded bg-muted px-1 py-0.5 text-[12px]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${keyBase}-${i++}`}>{t.slice(1, -1)}</em>);
    last = idx + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "p"; text: string } | { kind: "h"; text: string; level: number } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] } | { kind: "table"; rows: string[][] };

function parse(md: string): Block[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "h", text: h[2] ?? "", level: (h[1] ?? "#").length });
      i++;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*•]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i] ?? "")) {
        const cells = (lines[i] ?? "").trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && (lines[i] ?? "").trim() && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i] ?? "")) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parse(text), [text]);
  return (
    <div className={className}>
      {blocks.map((b, bi) => {
        const k = `b${bi}`;
        if (b.kind === "h") return <p key={k} className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{inline(b.text, k)}</p>;
        if (b.kind === "ul")
          return (
            <ul key={k} className="my-1.5 list-disc space-y-1 pl-4">
              {b.items.map((it, j) => (
                <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}</li>
              ))}
            </ul>
          );
        if (b.kind === "ol")
          return (
            <ol key={k} className="my-1.5 list-decimal space-y-1 pl-4">
              {b.items.map((it, j) => (
                <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}</li>
              ))}
            </ol>
          );
        if (b.kind === "table")
          return (
            <div key={k} className="my-2 overflow-x-auto">
              <table className="w-full text-[12px]">
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={`${k}-${ri}`} className={ri === 0 ? "border-b border-border font-semibold" : "border-b border-border/50"}>
                      {r.map((c, ci) => (
                        <td key={`${k}-${ri}-${ci}`} className="px-2 py-1 align-top">
                          {inline(c, `${k}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return (
          <p key={k} className="my-1.5 leading-relaxed">
            {inline(b.text, k)}
          </p>
        );
      })}
    </div>
  );
}
