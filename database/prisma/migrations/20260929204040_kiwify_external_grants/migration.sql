-- CreateTable
CREATE TABLE "ExternalGrant" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "lastEvent" TEXT NOT NULL,
    "lastOrderId" TEXT,
    "appliedUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalGrant_email_idx" ON "ExternalGrant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalGrant_provider_externalId_key" ON "ExternalGrant"("provider", "externalId");
