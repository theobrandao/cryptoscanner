import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ prisma: { $executeRaw: vi.fn() } }));
vi.mock("@/database/client", () => ({ getPrisma: () => db.prisma, requirePrisma: () => db.prisma }));

import type { Prisma } from "@prisma/client";
import { getCache } from "@/lib/cache";
import { batchDeleteSql, purgeOldRows, RETENTION_RULES, runRetention } from "@/services/retention-service";

const now = new Date("2026-09-30T12:00:00Z");
const day = 86_400_000;

describe("retenção de dados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCache()._clearMemory();
  });

  it("prazos aprovados; BillingEvent, AdminAuditLog e AccessLog ficam fora", () => {
    const days = Object.fromEntries(RETENTION_RULES.map((r) => [r.table, r.maxAgeMs / day]));
    expect(days).toEqual({ ScannerResult: 2, MarketSnapshot: 7, CronRun: 14, PasswordReset: 7, AgentLog: 90, AgentResult: 90, AgentExecution: 90, MonitorEvent: 180, ScanHistoryEntry: 180, AnalyticsEvent: 365 });
    const tables = RETENTION_RULES.map((r) => r.table);
    expect(tables.indexOf("AgentResult")).toBeLessThan(tables.indexOf("AgentExecution"));
    const rule = RETENTION_RULES.find((r) => r.table === "PasswordReset")!;
    expect(rule.column).toBe("expiresAt");
  });

  it("SQL em lote com LIMIT e data de corte parametrizada", () => {
    const sql = batchDeleteSql({ table: "AgentLog", column: "createdAt", maxAgeMs: 0 }, new Date(now.getTime() - 90 * day), 5000);
    expect(sql.sql).toBe('DELETE FROM "AgentLog" WHERE "id" IN (SELECT "id" FROM "AgentLog" WHERE "createdAt" < ? LIMIT ?)');
    expect(sql.values).toEqual([new Date(now.getTime() - 90 * day), 5000]);
  });

  it("repete o lote enquanto vier cheio e passa para a próxima tabela", async () => {
    const counts = [5000, 5000, 12, 0];
    const exec = vi.fn(async (sql: Prisma.Sql) => (sql.values.length ? (counts.shift() ?? 0) : 0));
    const r = await purgeOldRows(exec, { now, rules: [{ table: "AgentLog", column: "createdAt", maxAgeMs: 90 * day }, { table: "CronRun", column: "startedAt", maxAgeMs: 14 * day }] });
    expect(exec).toHaveBeenCalledTimes(4);
    expect(r.deleted).toEqual({ AgentLog: 10_012 });
    expect(r.incomplete).toEqual([]);
  });

  it("para quando o orçamento acaba e marca as tabelas incompletas; erro de uma tabela não para as outras", async () => {
    let calls = 0;
    const exec = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("timeout");
      return 5000;
    });
    const r = await purgeOldRows(exec, { now, rules: RETENTION_RULES.slice(0, 3), shouldStop: () => calls >= 3 });
    expect(r.errors[0]).toMatch(/^ScannerResult: timeout/);
    expect(r.deleted).toEqual({ MarketSnapshot: 10_000 });
    expect(r.incomplete).toEqual(["MarketSnapshot", "CronRun"]);
  });

  it("roda no máximo uma vez por hora; se faltar tempo, libera o próximo ciclo", async () => {
    db.prisma.$executeRaw.mockResolvedValue(0);
    const first = await runRetention({ now });
    expect("deleted" in first).toBe(true);
    expect(db.prisma.$executeRaw).toHaveBeenCalledTimes(RETENTION_RULES.length);
    expect(await runRetention({ now })).toEqual({ skipped: "executada na última hora" });

    getCache()._clearMemory();
    const deadline = { expired: () => true } as unknown as import("@/lib/cron").Deadline;
    const cut = await runRetention({ now, deadline });
    expect("incomplete" in cut && cut.incomplete.length).toBe(RETENTION_RULES.length);
    expect("deleted" in (await runRetention({ now }))).toBe(true);
  });
});
