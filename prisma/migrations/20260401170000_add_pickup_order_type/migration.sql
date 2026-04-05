DO $$
BEGIN
  ALTER TYPE "OrderType" ADD VALUE 'pickup';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
