ALTER TABLE "Product" ADD COLUMN "seq" INTEGER;

UPDATE "Product" p
SET "seq" = ranked.seq
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "id") AS seq
  FROM "Product"
) ranked
WHERE p."id" = ranked."id";

ALTER TABLE "Product" ALTER COLUMN "seq" SET NOT NULL;

CREATE UNIQUE INDEX "Product_tenantId_seq_key" ON "Product"("tenantId", "seq");

CREATE OR REPLACE FUNCTION next_product_seq(p_tenant_id UUID)
RETURNS INT AS $$
  SELECT COALESCE(MAX("seq"), 0) + 1
  FROM "Product"
  WHERE "tenantId" = p_tenant_id;
$$ LANGUAGE sql;
