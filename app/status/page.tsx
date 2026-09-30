import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PAGE_SEO } from "@/lib/seo/pages";
import { StatusView } from "@/components/status/status-view";

export const metadata: Metadata = publicPageMetadata(PAGE_SEO.status);

export default function StatusPage() {
  return <StatusView />;
}
