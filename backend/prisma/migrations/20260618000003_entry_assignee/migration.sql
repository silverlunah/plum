ALTER TABLE "TestRunEntry" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "TestRunEntry" ADD CONSTRAINT "TestRunEntry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
