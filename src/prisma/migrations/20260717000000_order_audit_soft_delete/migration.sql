-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "created_by" TEXT,
ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by" TEXT;

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_product_id_idx" ON "orders"("product_id");
