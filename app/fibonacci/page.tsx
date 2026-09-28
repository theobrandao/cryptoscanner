import type { Metadata } from "next";
import { FibonacciView } from "@/components/market/fibonacci-view";

export const metadata: Metadata = { title: "Fibonacci" };
export default function Page() {
  return <FibonacciView />;
}
