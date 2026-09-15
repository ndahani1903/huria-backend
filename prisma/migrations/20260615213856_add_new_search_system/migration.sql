-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "addToCartCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "customerAffinityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lastSearchAt" TIMESTAMP(3),
ADD COLUMN     "popularSearchCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "synonymTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CustomerSearchAnalytics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "searchDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "searchSource" TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "productsViewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productClicked" TEXT,
    "timeSpentMs" INTEGER NOT NULL DEFAULT 0,
    "addedToCart" BOOLEAN NOT NULL DEFAULT false,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "purchasedProductId" TEXT,
    "deviceType" TEXT,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSearchAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProductAffinity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "searchScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchaseScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "addToCartCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "lastInteraction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightDecay" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularSearchTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "clickThroughRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSearched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopularSearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSearchIndex" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nameVector" TEXT,
    "keywordVector" TEXT,
    "combinedText" TEXT,
    "nameBoost" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "keywordBoost" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "categoryBoost" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerSearchAnalytics_userId_idx" ON "CustomerSearchAnalytics"("userId");

-- CreateIndex
CREATE INDEX "CustomerSearchAnalytics_searchTerm_idx" ON "CustomerSearchAnalytics"("searchTerm");

-- CreateIndex
CREATE INDEX "CustomerSearchAnalytics_searchDate_idx" ON "CustomerSearchAnalytics"("searchDate");

-- CreateIndex
CREATE INDEX "CustomerSearchAnalytics_userId_searchDate_idx" ON "CustomerSearchAnalytics"("userId", "searchDate");

-- CreateIndex
CREATE INDEX "CustomerProductAffinity_userId_overallScore_idx" ON "CustomerProductAffinity"("userId", "overallScore");

-- CreateIndex
CREATE INDEX "CustomerProductAffinity_productId_idx" ON "CustomerProductAffinity"("productId");

-- CreateIndex
CREATE INDEX "CustomerProductAffinity_overallScore_idx" ON "CustomerProductAffinity"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProductAffinity_userId_productId_key" ON "CustomerProductAffinity"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PopularSearchTerm_term_key" ON "PopularSearchTerm"("term");

-- CreateIndex
CREATE INDEX "PopularSearchTerm_searchCount_idx" ON "PopularSearchTerm"("searchCount");

-- CreateIndex
CREATE INDEX "PopularSearchTerm_lastSearched_idx" ON "PopularSearchTerm"("lastSearched");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSearchIndex_productId_key" ON "ProductSearchIndex"("productId");

-- CreateIndex
CREATE INDEX "ProductSearchIndex_nameVector_idx" ON "ProductSearchIndex"("nameVector");

-- CreateIndex
CREATE INDEX "ProductSearchIndex_keywordVector_idx" ON "ProductSearchIndex"("keywordVector");

-- AddForeignKey
ALTER TABLE "CustomerSearchAnalytics" ADD CONSTRAINT "CustomerSearchAnalytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductAffinity" ADD CONSTRAINT "CustomerProductAffinity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductAffinity" ADD CONSTRAINT "CustomerProductAffinity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSearchIndex" ADD CONSTRAINT "ProductSearchIndex_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
