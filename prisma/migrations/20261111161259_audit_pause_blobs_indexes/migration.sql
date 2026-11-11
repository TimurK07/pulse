-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "pausedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FileBlob" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Attachment_issueId_idx" ON "Attachment"("issueId");

-- CreateIndex
CREATE INDEX "Issue_departmentId_idx" ON "Issue"("departmentId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_issueId_idx" ON "Notification"("issueId");

-- Обращения, которые уже ждут ответа автора: пауза с момента запроса уточнения
UPDATE "Issue" i SET "pausedAt" = COALESCE(
  (SELECT max(e."createdAt") FROM "IssueEvent" e WHERE e."issueId" = i."id" AND e."type" = 'STATUS_CHANGED' AND e."toValue" = 'NEEDS_INFO'),
  i."updatedAt")
WHERE i."status" = 'NEEDS_INFO';
