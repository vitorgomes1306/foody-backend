-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('lite', 'basic', 'master');

-- AlterTable
-- Existing users keep full access. New registrations must explicitly choose a plan,
-- while the database default protects older integrations that create users directly.
ALTER TABLE "User" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'master';
