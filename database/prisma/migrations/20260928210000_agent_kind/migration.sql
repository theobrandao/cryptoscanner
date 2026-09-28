-- AlterTable: tipo do agente (agent | sentinel)
ALTER TABLE "Agent" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'agent';

-- CreateIndex
CREATE INDEX "Agent_userId_kind_idx" ON "Agent"("userId", "kind");
