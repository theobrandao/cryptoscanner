import type { Metadata } from "next";
import { Suspense } from "react";
import { PlansView } from "@/components/account/plans-view";

export const metadata: Metadata = { title: "Plans" };
export default function Page() {
  return (
    <Suspense>
      <PlansView />
    </Suspense>
  );
}
