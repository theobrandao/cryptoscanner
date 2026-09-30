/**
 * Parâmetros de rastreio de afiliado e campanha (Kiwify: afid, src, sck; UTMs). Guardados por 30 dias no
 * navegador ao chegar pela página de vendas e repassados ao link de checkout da Kiwify, para que a venda
 * feita depois do teste grátis continue atribuída ao afiliado que trouxe o visitante.
 */
const KEYS = ["afid", "src", "sck", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const STORE = "cs-aff";
const TTL_MS = 30 * 86_400_000;

type Saved = { at: number; params: Record<string, string> };

export function captureAffiliateParams(search: string): void {
  try {
    const q = new URLSearchParams(search);
    const params: Record<string, string> = {};
    for (const k of KEYS) {
      const v = q.get(k);
      if (v && v.length <= 100 && /^[\w.\-~%+ ]+$/.test(v)) params[k] = v;
    }
    if (!Object.keys(params).length) return;
    window.localStorage.setItem(STORE, JSON.stringify({ at: Date.now(), params } satisfies Saved));
  } catch {
    /* navegador sem armazenamento: segue sem rastreio */
  }
}

function saved(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return {};
    const s = JSON.parse(raw) as Saved;
    if (!s?.params || Date.now() - s.at > TTL_MS) return {};
    return s.params;
  } catch {
    return {};
  }
}

/** Acrescenta os parâmetros guardados só em links da Kiwify; outros links saem como vieram. */
export function withAffiliateParams(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!(host === "kiwify.com.br" || host.endsWith(".kiwify.com.br") || host === "kiwify.com" || host.endsWith(".kiwify.com"))) return url;
    for (const [k, v] of Object.entries(saved())) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}
