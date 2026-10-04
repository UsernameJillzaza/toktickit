-- Lab 3 §5.2 / spec FR-23, BR-39: evolve the Lab 2 DevRequester table into the
-- real User model IN PLACE.
--
-- Hand-written on purpose: `prisma migrate dev` generated a DROP TABLE
-- "DevRequester" + CREATE TABLE "User" for this change ("You are about to drop
-- the `DevRequester` table, which is not empty"), which would have destroyed
-- every requester row and broken the Ticket.requesterId foreign key. A rename
-- keeps every primary key, so every existing Ticket stays owned by the same
-- person. The Ticket_requesterId_fkey constraint follows the table rename
-- automatically (Postgres references tables by OID, not by name).

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMIN');

-- Rename table + the objects Prisma names after it, so the schema has no drift.
ALTER TABLE "DevRequester" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "DevRequester_pkey" TO "User_pkey";
ALTER INDEX "DevRequester_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "DevRequester_id_seq" RENAME TO "User_id_seq";

-- New columns. Existing rows were all Lab 2 requesters, so REQUESTER is the
-- correct backfill for role. passwordHash stays NULL: no credentials are ever
-- written into a committed migration (spec D-10) — the idempotent seed issues
-- the documented local-dev initial password instead (BR-40).
ALTER TABLE "User"
    ADD COLUMN "role" "Role" NOT NULL DEFAULT 'REQUESTER',
    ADD COLUMN "passwordHash" TEXT,
    ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- @updatedAt is maintained by Prisma, not by a DB default — drop the default
-- that was only needed to backfill existing rows.
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- BR-06: emails are stored trimmed + lowercased so the unique index is
-- effectively case-insensitive.
UPDATE "User" SET "email" = lower(btrim("email"));

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
