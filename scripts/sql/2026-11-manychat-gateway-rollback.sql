-- Roll back the ManyChat PRE-AI gateway ledger only.
-- Does not touch Cargo, Shipment, loyalty, or bot tables.
-- Idempotent. Run only when an operator has decided to remove the gateway schema.
-- Apply order is the inverse of prisma/migrations/20261106120000_manychat_gateway/migration.sql.

DROP TABLE IF EXISTS "ManychatReplyReservation";
DROP TABLE IF EXISTS "ManychatAdmission";
DROP TABLE IF EXISTS "ManychatBatch";
DROP TABLE IF EXISTS "ManychatSubscriberLock";
