-- CreateTable
CREATE TABLE "BacktestStat" (
    "id" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT '*',
    "regime" TEXT NOT NULL DEFAULT '*',
    "samples" INTEGER NOT NULL,
    "hitRate" DOUBLE PRECISION,
    "expectancyR" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "metrics" JSONB NOT NULL,
    "fromTime" TIMESTAMP(3) NOT NULL,
    "toTime" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestStat_timeframe_symbol_regime_idx" ON "BacktestStat"("timeframe", "symbol", "regime");

-- CreateIndex
CREATE UNIQUE INDEX "BacktestStat_timeframe_patternKey_symbol_regime_key" ON "BacktestStat"("timeframe", "patternKey", "symbol", "regime");
