ALTER TABLE "ticket_instances"
ADD COLUMN "claimed_by_id" TEXT,
ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "close_reason" TEXT,
ADD COLUMN "closed_by_id" TEXT;
