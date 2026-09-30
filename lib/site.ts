/** URL pública canônica do site (metadados, sitemap, robots). Em ambiente local cai no domínio de produção. */
const raw = process.env.NEXT_PUBLIC_APP_URL ?? "";
export const SITE_URL = (/^https:\/\//.test(raw) ? raw : "https://www.cryptoscanner.com.br").replace(/\/+$/, "");
