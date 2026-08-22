ALTER TABLE "User" ADD COLUMN "billingCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "billingTrialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "User_billingCustomerId_key" ON "User"("billingCustomerId");

CREATE TABLE "BillingSettings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "activeProvider" TEXT NOT NULL DEFAULT 'stripe',
  "litePrice" DECIMAL(10,2) NOT NULL DEFAULT 29.90,
  "basicPrice" DECIMAL(10,2) NOT NULL DEFAULT 99.90,
  "masterPrice" DECIMAL(10,2) NOT NULL DEFAULT 199.90,
  "initialTrialDays" INTEGER NOT NULL DEFAULT 7,
  "postExpirationGraceDays" INTEGER NOT NULL DEFAULT 0,
  "subscriptionDays" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingSettings_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "BillingSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL,
  "userId" INTEGER NOT NULL,
  "plan" "Plan" NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'brl',
  "providerCheckoutId" TEXT,
  "providerPaymentId" TEXT,
  "paymentMethod" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_providerCheckoutId_key" ON "Subscription"("providerCheckoutId");
CREATE UNIQUE INDEX "Subscription_providerPaymentId_key" ON "Subscription"("providerPaymentId");
CREATE INDEX "Subscription_userId_status_endsAt_idx" ON "Subscription"("userId", "status", "endsAt");
CREATE INDEX "Subscription_provider_providerCheckoutId_idx" ON "Subscription"("provider", "providerCheckoutId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
