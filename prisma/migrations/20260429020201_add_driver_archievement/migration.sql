-- CreateTable
CREATE TABLE "DriverAchievement" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverAchievement_driverId_idx" ON "DriverAchievement"("driverId");

-- CreateIndex
CREATE INDEX "DriverAchievement_awardedAt_idx" ON "DriverAchievement"("awardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAchievement_driverId_achievementId_key" ON "DriverAchievement"("driverId", "achievementId");

-- AddForeignKey
ALTER TABLE "DriverAchievement" ADD CONSTRAINT "DriverAchievement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
