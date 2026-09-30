import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Páginas de conta, administração e API ficam fora do índice. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/preferencias", "/carteira", "/redefinir-senha", "/esqueci-senha", "/suporte"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
