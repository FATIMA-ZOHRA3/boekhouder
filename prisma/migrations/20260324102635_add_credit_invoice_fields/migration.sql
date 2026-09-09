-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "isCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalInvoiceId" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
