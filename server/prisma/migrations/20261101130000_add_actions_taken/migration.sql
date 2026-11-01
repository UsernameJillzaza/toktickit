-- Lab 4 L4-2: Actions Taken (spec Section 7, migration 4 of 4).
--
-- Create-only: one enum and one table with their indexes and foreign keys.
-- Nothing that exists is altered or dropped, and there is no backfill (BR-21):
-- existing Tickets simply have zero Actions.
--
-- Two hand-added guarantees that Prisma cannot express (D-04, D-05):
--   * the unique (ticketId, requestKey) pair makes a retried create safe at the
--     database level (NULL keys are all distinct in PostgreSQL, as intended);
--   * the CHECK ties followUpNote to followUpRequired, so the rule holds even
--     if a future code path forgets to validate (BR-06).
--
-- Recovery: DROP TABLE "ActionTaken"; DROP TYPE "ActionStatus"; then delete
-- this migration's row from "_prisma_migrations" (take a pg_dump first).

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "performedById" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "requestKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActionTaken_followUp_check" CHECK ("followUpRequired" = true OR "followUpNote" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_ticketId_requestKey_key" ON "ActionTaken"("ticketId", "requestKey");

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_performedById_actionAt_idx" ON "ActionTaken"("performedById", "actionAt");

-- CreateIndex
CREATE INDEX "ActionTaken_status_idx" ON "ActionTaken"("status");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
