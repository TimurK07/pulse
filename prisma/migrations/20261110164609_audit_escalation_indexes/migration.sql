-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "reactionEscalatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Issue_status_dueAt_idx" ON "Issue"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Supporter_userId_idx" ON "Supporter"("userId");
