import { prisma } from "./lib/prisma";

async function main() {
  const result = await prisma.$queryRaw`SELECT 1`;

  console.log("✅ Database connected:", result);
}

main()
  .catch((error) => {
    console.error("❌ Database connection failed:", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
