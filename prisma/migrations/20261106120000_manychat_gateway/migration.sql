-- ManyChat PRE-AI gateway ledger. Unapplied until an operator runs migrations
-- against a non-production database and then production, on purpose.
-- Do not apply this file as part of review.

CREATE TABLE "ManychatSubscriberLock" (
    "tenant" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "latestBatchId" TEXT,
    CONSTRAINT "ManychatSubscriberLock_pkey" PRIMARY KEY ("tenant", "pageId", "subscriberId")
);

CREATE TABLE "ManychatBatch" (
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

CREATE TABLE "ManychatAdmission" (
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

CREATE UNIQUE INDEX "ManychatAdmission_eventKey_key" ON "ManychatAdmission"("eventKey");
CREATE INDEX "ManychatAdmission_window_idx" ON "ManychatAdmission"("tenant", "pageId", "subscriberId", "admittedAt");
CREATE INDEX "ManychatAdmission_text_idx" ON "ManychatAdmission"("textKey", "admittedAt");
CREATE INDEX "ManychatBatch_open_idx" ON "ManychatBatch"("tenant", "pageId", "subscriberId", "state", "deliverAfter");

CREATE TABLE "ManychatReplyReservation" (
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

CREATE UNIQUE INDEX "ManychatReplyReservation_claimId_key" ON "ManychatReplyReservation"("claimId");
CREATE UNIQUE INDEX "ManychatReplyReservation_revision_key" ON "ManychatReplyReservation"("tenant", "pageId", "subscriberId", "revision");
CREATE INDEX "ManychatReplyReservation_batch_idx" ON "ManychatReplyReservation"("batchId");
