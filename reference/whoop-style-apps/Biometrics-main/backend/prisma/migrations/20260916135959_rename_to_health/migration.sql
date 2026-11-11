-- Rename the FitbitConnection table to HealthConnection
ALTER TABLE "FitbitConnection" RENAME TO "HealthConnection";

-- Rename the fitbitUserId column to healthUserId
ALTER TABLE "HealthConnection" RENAME COLUMN "fitbitUserId" TO "healthUserId";

-- Rename the primary key constraint
ALTER TABLE "HealthConnection" RENAME CONSTRAINT "FitbitConnection_pkey" TO "HealthConnection_pkey";

-- Rename the foreign key constraint
ALTER TABLE "HealthConnection" RENAME CONSTRAINT "FitbitConnection_userId_fkey" TO "HealthConnection_userId_fkey";

-- Rename the unique indexes
ALTER INDEX "FitbitConnection_userId_key" RENAME TO "HealthConnection_userId_key";
ALTER INDEX "FitbitConnection_fitbitUserId_key" RENAME TO "HealthConnection_healthUserId_key";

-- Rename the enum type
ALTER TYPE "FitbitConnectionStatus" RENAME TO "HealthConnectionStatus";
