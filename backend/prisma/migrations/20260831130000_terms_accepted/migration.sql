-- Records that the operator accepted the first-run notice during setup.
-- Nullable so instances created before this stay valid.

ALTER TABLE "Organization" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
