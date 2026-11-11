-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "themeDecisionId" TEXT;

-- CreateTable
CREATE TABLE "ThemeDecision" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL,
    "ownerId" TEXT,
    "decidedById" TEXT NOT NULL,
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Issue_themeDecisionId_idx" ON "Issue"("themeDecisionId");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_themeDecisionId_fkey" FOREIGN KEY ("themeDecisionId") REFERENCES "ThemeDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeDecision" ADD CONSTRAINT "ThemeDecision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeDecision" ADD CONSTRAINT "ThemeDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
