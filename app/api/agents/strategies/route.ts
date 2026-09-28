import { listStrategies } from "@/agents/strategies";
import { ok, withApi } from "@/lib/api";

export const GET = withApi(async () => ok({ strategies: listStrategies() }));
