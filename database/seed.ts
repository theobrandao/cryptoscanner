/**
 * Seed: cadastra o universo de ativos e um usuário de demonstração.
 * Executar com: npm run db:seed
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ASSETS } from "@/lib/assets";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  for (const a of ASSETS) {
    await prisma.asset.upsert({
      where: { symbol: a.symbol },
      update: { name: a.name, binancePair: a.binancePair, krakenPair: a.krakenPair, coingeckoId: a.coingeckoId, sortOrder: a.sortOrder, active: true },
      create: { symbol: a.symbol, name: a.name, binancePair: a.binancePair, krakenPair: a.krakenPair, coingeckoId: a.coingeckoId, sortOrder: a.sortOrder },
    });
  }
  const demoEmail = process.env.SEED_DEMO_EMAIL ?? "demo@cryptoscanner.local";
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Demo12345!";
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: { email: demoEmail, name: "Usuário Demo", passwordHash, plan: "PLATINUM", preference: { create: {} } },
  });
  const existing = await prisma.watchlist.findFirst({ where: { userId: user.id, isDefault: true } });
  if (!existing) {
    const btc = await prisma.asset.findUnique({ where: { symbol: "BTC" } });
    const eth = await prisma.asset.findUnique({ where: { symbol: "ETH" } });
    await prisma.watchlist.create({
      data: {
        userId: user.id,
        name: "Favoritos",
        isDefault: true,
        items: { create: [btc, eth].filter(Boolean).map((a) => ({ assetId: a!.id })) },
      },
    });
  }
  console.log(`Seed concluído. Ativos: ${ASSETS.length}. Usuário demo: ${demoEmail} / ${demoPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
