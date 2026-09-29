import type { Metadata } from "next";
import { AdminView } from "@/components/admin/admin-view";

export const metadata: Metadata = { title: "Admin — CryptoScanner", robots: { index: false } };

export default function AdminPage() {
  return <AdminView />;
}
