ALTER TABLE "Category"
ADD COLUMN "iconKey" TEXT;

ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_tenantId_fkey";
ALTER TABLE "Category"
ADD CONSTRAINT "Category_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH defaults(name, icon_key) AS (
  VALUES
    ('Bebidas', 'bebidas'), ('Hambúrgueres', 'hamburgueres'), ('Porções', 'porcoes'),
    ('Pastéis', 'pasteis'), ('Pizzas', 'pizzas'), ('Drinques', 'drinques'),
    ('Cervejas', 'cervejas'), ('Frutos do Mar', 'frutos-do-mar'), ('Carnes', 'carnes'),
    ('Saladas', 'saladas'), ('Japonês', 'japones'), ('Massas', 'massas'),
    ('Sobremesas', 'sobremesas'), ('Cafés', 'cafes'), ('Café da Manhã', 'cafe-da-manha'),
    ('Sanduíches', 'sanduiches'), ('Wraps', 'wraps'), ('Cachorro-quente', 'cachorro-quente'),
    ('Sopas', 'sopas'), ('Vegetariano', 'vegetariano'), ('Infantil', 'infantil'),
    ('Molhos', 'molhos'), ('Sem Glúten', 'sem-gluten'), ('Vegano', 'vegano'),
    ('Sucos', 'sucos'), ('Milk-shakes', 'milk-shakes'), ('Smoothies', 'smoothies'),
    ('Sorvetes', 'sorvetes'), ('Doces', 'doces'), ('Combos', 'combos')
)
UPDATE "Category" AS category
SET "iconKey" = defaults.icon_key
FROM defaults
WHERE lower(category.name) = lower(defaults.name) AND category."iconKey" IS NULL;

WITH defaults(name, icon_key) AS (
  VALUES
    ('Bebidas', 'bebidas'), ('Hambúrgueres', 'hamburgueres'), ('Porções', 'porcoes'),
    ('Pastéis', 'pasteis'), ('Pizzas', 'pizzas'), ('Drinques', 'drinques'),
    ('Cervejas', 'cervejas'), ('Frutos do Mar', 'frutos-do-mar'), ('Carnes', 'carnes'),
    ('Saladas', 'saladas'), ('Japonês', 'japones'), ('Massas', 'massas'),
    ('Sobremesas', 'sobremesas'), ('Cafés', 'cafes'), ('Café da Manhã', 'cafe-da-manha'),
    ('Sanduíches', 'sanduiches'), ('Wraps', 'wraps'), ('Cachorro-quente', 'cachorro-quente'),
    ('Sopas', 'sopas'), ('Vegetariano', 'vegetariano'), ('Infantil', 'infantil'),
    ('Molhos', 'molhos'), ('Sem Glúten', 'sem-gluten'), ('Vegano', 'vegano'),
    ('Sucos', 'sucos'), ('Milk-shakes', 'milk-shakes'), ('Smoothies', 'smoothies'),
    ('Sorvetes', 'sorvetes'), ('Doces', 'doces'), ('Combos', 'combos')
)
INSERT INTO "Category" (name, "iconKey", "tenantId", active, "createdAt")
SELECT defaults.name, defaults.icon_key, tenant.id, true, NOW()
FROM "Tenant" AS tenant
CROSS JOIN defaults
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" AS existing
  WHERE existing."tenantId" = tenant.id AND lower(existing.name) = lower(defaults.name)
);
