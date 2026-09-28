-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "initialCapital" DOUBLE PRECISION NOT NULL,
    "monthlyContribution" DOUBLE PRECISION NOT NULL,
    "months" INTEGER NOT NULL,
    "riskProfile" TEXT NOT NULL,
    "totalInvested" DOUBLE PRECISION NOT NULL,
    "finalValue" DOUBLE PRECISION NOT NULL,
    "profitPct" DOUBLE PRECISION NOT NULL,
    "maxDrawdownPct" DOUBLE PRECISION NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Simulation_userId_createdAt_idx" ON "Simulation"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
