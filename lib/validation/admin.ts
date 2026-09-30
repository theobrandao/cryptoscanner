import { z } from "zod";
import { ADMIN_SORTS, ADMIN_STATUSES, ADMIN_TIERS } from "@/lib/admin-users";

/** Filtros da lista de usuários do Painel de controle (lista e exportação CSV). */
export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  tier: z.enum(ADMIN_TIERS).optional(),
  status: z.enum(ADMIN_STATUSES).optional(),
  sort: z.enum(ADMIN_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});
