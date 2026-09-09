-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reconciledAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashTransaction_userId_transactionDate_idx" ON "CashTransaction"("userId", "transactionDate");

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
