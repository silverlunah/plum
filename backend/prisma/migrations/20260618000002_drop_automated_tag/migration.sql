-- TestCase.automatedTag removed: displayId is now used directly as the Cucumber tag identifier
ALTER TABLE "TestCase" DROP COLUMN IF EXISTS "automatedTag";
