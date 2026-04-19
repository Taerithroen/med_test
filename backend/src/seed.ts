import dayjs from "dayjs";
import { prisma } from "./lib/prisma.js";

async function main() {
  const count = await prisma.sale.count();
  if (count > 0) return;

  const regions = ["Север", "Юг", "Восток", "Запад"];
  const start = dayjs().subtract(30, "day");

  const data = Array.from({ length: 400 }).map((_, i) => {
    const d = start.add(i % 30, "day").toDate();
    const region = regions[i % regions.length];
    const amount = 500 + ((i * 37) % 5000);
    return { date: d, region, amount };
  });

  await prisma.sale.createMany({ data });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

