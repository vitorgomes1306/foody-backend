-- CreateEnum
CREATE TYPE "TypeVehicle" AS ENUM ('Moto', 'Carro');

-- AlterTable
ALTER TABLE "deliveryMen" ADD COLUMN     "typeVehicle" "TypeVehicle";
