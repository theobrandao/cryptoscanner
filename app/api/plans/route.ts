import { ok, withApi } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { PLANS } from "@/lib/plans";

export const GET = withApi(async () =>
  ok({
    plans: Object.values(PLANS).map((p) => ({ ...p, imageAnalysesPerDay: Number.isFinite(p.imageAnalysesPerDay) ? p.imageAnalysesPerDay : null })),
    selfChangeAllowed: getEnv().ALLOW_SELF_PLAN_CHANGE,
    billing: "none",
  }),
);
