/*
  Warnings:

  - Made the column `licenseNumber` on table `Driver` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nidaNumber` on table `Driver` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Driver" ALTER COLUMN "licenseNumber" SET NOT NULL,
ALTER COLUMN "nidaNumber" SET NOT NULL;

-- CreateTable
CREATE TABLE "DriverMission" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverMission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverMission_driverId_missionId_key" ON "DriverMission"("driverId", "missionId");

-- AddForeignKey
ALTER TABLE "DriverMission" ADD CONSTRAINT "DriverMission_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
