-- Frente 4 (banco, cron e cache): índices para as consultas do ciclo, FKs sem índice e colunas usadas pela retenção.
-- IF EXISTS / IF NOT EXISTS: idempotente em bancos que já receberam o índice manualmente. Nomes no padrão do Prisma (sem drift).

-- PatternSignal: groupBy por timeframe (liveStats) e abertos ordenados por detectedAt (trackLiveSignals)
DROP INDEX IF EXISTS "PatternSignal_status_idx";
DROP INDEX IF EXISTS "PatternSignal_patternKey_timeframe_status_idx";
CREATE INDEX IF NOT EXISTS "PatternSignal_status_detectedAt_idx" ON "PatternSignal"("status", "detectedAt");
CREATE INDEX IF NOT EXISTS "PatternSignal_timeframe_patternKey_status_idx" ON "PatternSignal"("timeframe", "patternKey", "status");

-- Limpeza por data (services/retention-service.ts)
CREATE INDEX IF NOT EXISTS "MarketSnapshot_collectedAt_idx" ON "MarketSnapshot"("collectedAt");
CREATE INDEX IF NOT EXISTS "CronRun_startedAt_idx" ON "CronRun"("startedAt");
CREATE INDEX IF NOT EXISTS "AgentLog_createdAt_idx" ON "AgentLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AgentExecution_startedAt_idx" ON "AgentExecution"("startedAt");
CREATE INDEX IF NOT EXISTS "AgentResult_createdAt_idx" ON "AgentResult"("createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "MonitorEvent_createdAt_idx" ON "MonitorEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "ScanHistoryEntry_createdAt_idx" ON "ScanHistoryEntry"("createdAt");

-- Chaves estrangeiras sem índice (ON DELETE CASCADE/SET NULL e junções)
CREATE INDEX IF NOT EXISTS "MonitorEvent_monitorId_idx" ON "MonitorEvent"("monitorId");
CREATE INDEX IF NOT EXISTS "AgentExecution_userId_idx" ON "AgentExecution"("userId");
CREATE INDEX IF NOT EXISTS "Monitor_strategyId_idx" ON "Monitor"("strategyId");
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON "SupportTicket"("userId");
CREATE INDEX IF NOT EXISTS "Alert_assetId_idx" ON "Alert"("assetId");
CREATE INDEX IF NOT EXISTS "WatchlistItem_assetId_idx" ON "WatchlistItem"("assetId");

-- Painel de controle: lista paginada por data de cadastro
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
