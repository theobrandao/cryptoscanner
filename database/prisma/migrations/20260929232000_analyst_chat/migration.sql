-- CreateTable
CREATE TABLE "AnalystConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalystMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalystConversation_userId_updatedAt_idx" ON "AnalystConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AnalystMessage_conversationId_createdAt_idx" ON "AnalystMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnalystConversation" ADD CONSTRAINT "AnalystConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalystMessage" ADD CONSTRAINT "AnalystMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AnalystConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
