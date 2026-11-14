-- ManyChat PRE-AI gateway ledger. Idempotent: safe to run again.
-- Unapplied until an operator runs scripts/add-manychat-gateway.ts on purpose.
-- Rollback: scripts/sql/2026-11-manychat-gateway-rollback.sql
-- Do not apply this file as part of review.

CREATE TABLE IF NOT EXISTS "ManychatSubscriberLock" (
    "tenant" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "latestBatchId" TEXT,
    CONSTRAINT "ManychatSubscriberLock_pkey" PRIMARY KEY ("tenant", "pageId", "subscriberId")
);

CREATE TABLE IF NOT EXISTS "ManychatBatch" (
    "id" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "scheduleState" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "deliverAfter" TIMESTAMP(3) NOT NULL,
    "lastInputText" TEXT NOT NULL,
    "eventId" TEXT,
    "messageCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryAttemptedAt" TIMESTAMP(3),
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ManychatBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManychatAdmission" (
    "id" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "eventKey" TEXT,
    "textKey" TEXT,
    "kind" TEXT NOT NULL,
    "counted" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "batchId" TEXT,
    "admittedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManychatAdmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManychatAdmission_eventKey_key" ON "ManychatAdmission"("eventKey");
CREATE INDEX IF NOT EXISTS "ManychatAdmission_window_idx" ON "ManychatAdmission"("tenant", "pageId", "subscriberId", "admittedAt");
CREATE INDEX IF NOT EXISTS "ManychatAdmission_text_idx" ON "ManychatAdmission"("textKey", "admittedAt");
CREATE INDEX IF NOT EXISTS "ManychatBatch_open_idx" ON "ManychatBatch"("tenant", "pageId", "subscriberId", "state", "deliverAfter");

CREATE TABLE IF NOT EXISTS "ManychatReplyReservation" (
    "id" TEXT NOT NULL,
    "tenant" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "claimId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "finishId" TEXT,
    "reservedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ManychatReplyReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManychatReplyReservation_claimId_key" ON "ManychatReplyReservation"("claimId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManychatReplyReservation_revision_key" ON "ManychatReplyReservation"("tenant", "pageId", "subscriberId", "revision");
CREATE INDEX IF NOT EXISTS "ManychatReplyReservation_batch_idx" ON "ManychatReplyReservation"("batchId");
