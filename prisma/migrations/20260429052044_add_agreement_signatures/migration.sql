-- CreateTable
CREATE TABLE "AgreementSignature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agreementType" TEXT NOT NULL,
    "agreementVersion" TEXT NOT NULL,
    "agreementHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgreementSignature_userId_idx" ON "AgreementSignature"("userId");

-- CreateIndex
CREATE INDEX "AgreementSignature_signedAt_idx" ON "AgreementSignature"("signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementSignature_userId_agreementType_key" ON "AgreementSignature"("userId", "agreementType");

-- AddForeignKey
ALTER TABLE "AgreementSignature" ADD CONSTRAINT "AgreementSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
