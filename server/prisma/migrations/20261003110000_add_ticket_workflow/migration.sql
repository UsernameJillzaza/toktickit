-- Lab 3 L3-5: ticket workflow (spec Section 7, migration 2 of 3).
--
-- Hand-written on purpose. `prisma migrate diff` generates
--   DROP COLUMN "requestedPriority", ADD COLUMN "requestedPriority" "Priority" NOT NULL
-- (and the same for "currentStatus"), which would throw away every existing
-- ticket's priority and status, and its NOT NULL columns can't be added to a
-- table that already has rows. Instead the text columns are converted in
-- place with USING casts and the new columns are backfilled before NOT NULL.
-- Every value in Lab 2 data is already a valid enum label (checked before
-- writing this: status = NEW only; priority = LOW / MEDIUM / HIGH).

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- Convert in place (keeps every row's value)
ALTER TABLE "Ticket" ALTER COLUMN "requestedPriority" TYPE "Priority" USING "requestedPriority"::"Priority";

ALTER TABLE "Ticket" ALTER COLUMN "currentStatus" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "currentStatus" TYPE "TicketStatus" USING "currentStatus"::"TicketStatus";
ALTER TABLE "Ticket" ALTER COLUMN "currentStatus" SET DEFAULT 'NEW';

-- New columns, backfilled before NOT NULL (BR-21: IT Priority starts equal
-- to Requested Priority; BR-26: "Last Updated" starts at creation time)
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "Priority";
UPDATE "Ticket" SET "itPriority" = "requestedPriority";
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

ALTER TABLE "Ticket" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Ticket" SET "updatedAt" = "createdAt";
ALTER TABLE "Ticket" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Ticket" ADD COLUMN "ownerId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "requesterResolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_idx" ON "Ticket"("currentStatus");

-- CreateIndex
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
