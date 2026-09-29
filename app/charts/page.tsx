import { redirect } from "next/navigation";

export default function ChartsIndex() {
  redirect("/charts/BTC?tf=4h");
}
