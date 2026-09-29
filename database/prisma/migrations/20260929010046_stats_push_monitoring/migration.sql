-- CreateTable
CREATE TABLE "PatternStat" (
    "id" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "samples" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "expired" INTEGER NOT NULL,
    "hitRate" DOUBLE PRECISION,
    "avgReturnPct" DOUBLE PRECISION,
    "avgBars" DOUBLE PRECISION,
    "assets" INTEGER NOT NULL,
    "fromTime" TIMESTAMP(3) NOT NULL,
    "toTime" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatternStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternSignal" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "stop" DOUBLE PRECISION NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candleTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "exitPrice" DOUBLE PRECISION,
    "returnPct" DOUBLE PRECISION,

    CONSTRAINT "PatternSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatternStat_timeframe_patternKey_key" ON "PatternStat"("timeframe", "patternKey");

-- CreateIndex
CREATE INDEX "PatternSignal_status_idx" ON "PatternSignal"("status");

-- CreateIndex
CREATE INDEX "PatternSignal_patternKey_timeframe_status_idx" ON "PatternSignal"("patternKey", "timeframe", "status");

-- CreateIndex
CREATE INDEX "PatternSignal_symbol_timeframe_patternKey_detectedAt_idx" ON "PatternSignal"("symbol", "timeframe", "patternKey", "detectedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
