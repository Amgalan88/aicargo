-- ManyChat PRE-AI gateway ledger. Unapplied until an operator runs migrations
-- against a non-production database and then production, on purpose.
-- Do not apply this file as part of review.

CREATE TABLE "ManychatSubscriberLock" (
    "tenant" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
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
