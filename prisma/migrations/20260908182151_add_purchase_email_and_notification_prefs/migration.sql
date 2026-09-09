-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "accountantAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "defaultRevenueAccount" TEXT,
ADD COLUMN     "defaultVatCode" TEXT,
ADD COLUMN     "kvkData" TEXT,
ADD COLUMN     "kvkLastSynced" TIMESTAMP(3),
ADD COLUMN     "kvkNumber" TEXT,
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "sbiCode" TEXT,
ADD COLUMN     "sbiDescription" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "bookedAt" TIMESTAMP(3),
ADD COLUMN     "vatType" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "category" TEXT,
ADD COLUMN     "vatCode" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" TEXT,
ADD COLUMN     "purchaseEmail" TEXT;

-- CreateTable
CREATE TABLE "PurchaseDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "label" TEXT,
    "supplierName" TEXT,
    "invoiceNumber" TEXT,
    "amount" DOUBLE PRECISION,
    "vatAmount" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION,
    "documentDate" TEXT,
    "category" TEXT,
    "description" TEXT,
    "vatType" TEXT,
    "notes" TEXT,
    "dueDate" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "reminderCosts" DOUBLE PRECISION,
    "paidAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lastMessage" TEXT,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadByUser" BOOLEAN NOT NULL DEFAULT false,
    "unreadByAccountant" BOOLEAN NOT NULL DEFAULT false,
    "contextType" TEXT,
    "contextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "category" TEXT,
    "assignedTo" TEXT,
    "createdByUserId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "invoiceId" TEXT,
    "purchaseDocId" TEXT,
    "bankTransactionId" TEXT,
    "customerResponse" TEXT,
    "customerNotes" TEXT,
    "customerFileUrl" TEXT,
    "customerFileName" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccount" TEXT,
    "transactionDate" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "counterpartyAccount" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "importBatchId" TEXT NOT NULL,
    "importHash" TEXT NOT NULL,
    "rawData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accountType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "statementSection" TEXT,
    "normalBalance" TEXT NOT NULL,
    "isBalanceSheet" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "vatCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "percentage" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "rubricCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ledgerAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'memoriaal',
    "totalDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "bookedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "ledgerAccount" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "vatCode" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxConcept" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "groundingFact" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'btw',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxConcept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_userId_importHash_key" ON "BankTransaction"("userId", "importHash");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_accountNumber_key" ON "LedgerAccount"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VatCode_code_key" ON "VatCode"("code");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TaxConcept_key_key" ON "TaxConcept"("key");

-- AddForeignKey
ALTER TABLE "PurchaseDocument" ADD CONSTRAINT "PurchaseDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionItem" ADD CONSTRAINT "ExceptionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionItem" ADD CONSTRAINT "ExceptionItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_vatCodeId_fkey" FOREIGN KEY ("vatCodeId") REFERENCES "VatCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatCode" ADD CONSTRAINT "VatCode_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
