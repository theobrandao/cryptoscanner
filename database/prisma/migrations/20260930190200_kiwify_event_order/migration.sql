-- AlterTable: data do último evento da Kiwify aplicado (ordenação de reentregas fora de ordem)
ALTER TABLE "ExternalGrant" ADD COLUMN "lastEventAt" TIMESTAMP(3);
