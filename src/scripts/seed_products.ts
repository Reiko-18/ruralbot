import "dotenv/config";
import { prisma } from "../core/db.js";

const categories = [
  "Discord",
  "Roblox",
  "米哈遊",
  "鳴潮",
  "Minecraft",
  "傳說對決",
  "蒸氣卡",
  "第五人格",
  "點卡",
  "特戰英豪",
];

interface ProductSeed {
  name: string;
  cost: number;
  price: number;
  category: string;
  costDiscount?: number;
  priceDiscount?: number;
}

const products: ProductSeed[] = [
  // Discord
  { name: "Discord 贈禮月", cost: 230, price: 260, category: "Discord" },
  { name: "Discord 登入月", cost: 170, price: 200, category: "Discord" },
  { name: "Discord 贈禮年", cost: 2300, price: 2600, category: "Discord" },
  { name: "Discord 登入年", cost: 1070, price: 1400, category: "Discord" },

  // Roblox
  { name: "Roblox 500R", cost: 150, price: 180, category: "Roblox" },
  { name: "Roblox 1000R", cost: 300, price: 360, category: "Roblox" },
  { name: "Roblox 2000R", cost: 580, price: 650, category: "Roblox" },
  { name: "Roblox 2500R", cost: 730, price: 800, category: "Roblox" },
  { name: "Roblox 5000R", cost: 1450, price: 1550, category: "Roblox" },
  { name: "Roblox 10000R", cost: 2650, price: 2900, category: "Roblox" },
  { name: "Roblox 贈禮", cost: 0, price: 0, category: "Roblox", costDiscount: 0.19, priceDiscount: 0.25 },

  // 米哈遊
  { name: "米哈遊 60點", cost: 40, price: 50, category: "米哈遊" },
  { name: "米哈遊 300點", cost: 120, price: 150, category: "米哈遊" },
  { name: "米哈遊 980點", cost: 340, price: 450, category: "米哈遊" },
  { name: "米哈遊 1980點", cost: 710, price: 800, category: "米哈遊" },
  { name: "米哈遊 3280點", cost: 1120, price: 1280, category: "米哈遊" },
  { name: "米哈遊 6480點", cost: 2160, price: 2350, category: "米哈遊" },
  { name: "米哈遊 小月卡", cost: 120, price: 150, category: "米哈遊" },

  // 鳴潮
  { name: "鳴潮 60", cost: 40, price: 50, category: "鳴潮" },
  { name: "鳴潮 300", cost: 145, price: 160, category: "鳴潮" },
  { name: "鳴潮 980", cost: 400, price: 450, category: "鳴潮" },
  { name: "鳴潮 1980", cost: 780, price: 900, category: "鳴潮" },
  { name: "鳴潮 3280", cost: 1330, price: 1530, category: "鳴潮" },
  { name: "鳴潮 6480", cost: 2500, price: 2750, category: "鳴潮" },
  { name: "鳴潮 小月卡", cost: 130, price: 150, category: "鳴潮" },
  { name: "鳴潮 寰宇頻道", cost: 280, price: 320, category: "鳴潮" },
  { name: "鳴潮 寰宇特約", cost: 550, price: 580, category: "鳴潮" },

  // Minecraft
  { name: "Minecraft", cost: 486, price: 700, category: "Minecraft" },
  { name: "Minecraft 序號", cost: 486, price: 700, category: "Minecraft" },
  { name: "Minecraft 成品號", cost: 270, price: 500, category: "Minecraft" },

  // 傳說對決
  { name: "傳說對決 1466點卷", cost: 910, price: 970, category: "傳說對決" },
  { name: "傳說對決 728點卷", cost: 455, price: 500, category: "傳說對決" },
  { name: "傳說對決 364點卷", cost: 228, price: 260, category: "傳說對決" },
  { name: "傳說對決 145點卷", cost: 91, price: 120, category: "傳說對決" },
  { name: "傳說對決 72點卷", cost: 46, price: 80, category: "傳說對決" },
  { name: "傳說對決 4543點卷", cost: 2720, price: 2900, category: "傳說對決" },

  // 蒸氣卡
  { name: "蒸氣卡 100TWD", cost: 110, price: 120, category: "蒸氣卡" },
  { name: "蒸氣卡 150TWD", cost: 160, price: 170, category: "蒸氣卡" },
  { name: "蒸氣卡 200TWD", cost: 210, price: 230, category: "蒸氣卡" },
  { name: "蒸氣卡 300TWD", cost: 310, price: 340, category: "蒸氣卡" },
  { name: "蒸氣卡 500TWD", cost: 510, price: 550, category: "蒸氣卡" },
  { name: "蒸氣卡 650TWD", cost: 660, price: 700, category: "蒸氣卡" },
  { name: "蒸氣卡 800TWD", cost: 810, price: 850, category: "蒸氣卡" },
  { name: "蒸氣卡 1000TWD", cost: 1010, price: 1050, category: "蒸氣卡" },
  { name: "蒸氣卡 1500TWD", cost: 1510, price: 1600, category: "蒸氣卡" },
  { name: "蒸氣卡 2000TWD", cost: 2010, price: 2100, category: "蒸氣卡" },

  // 第五人格
  { name: "第五人格 759 回聲", cost: 253, price: 275, category: "第五人格" },
  { name: "第五人格 1518 回聲", cost: 506, price: 570, category: "第五人格" },
  { name: "第五人格 2277 回聲", cost: 759, price: 950, category: "第五人格" },
  { name: "第五人格 3036 回聲", cost: 1012, price: 1250, category: "第五人格" },
  { name: "第五人格 3795 回聲", cost: 1265, price: 1450, category: "第五人格" },
  { name: "第五人格 4554 回聲", cost: 1518, price: 1750, category: "第五人格" },
  { name: "第五人格 5313 回聲", cost: 1771, price: 1855, category: "第五人格" },
  { name: "第五人格 6072 回聲", cost: 2024, price: 2300, category: "第五人格" },
  { name: "第五人格 6831 回聲", cost: 2277, price: 2500, category: "第五人格" },
  { name: "第五人格 7590 回聲", cost: 2530, price: 2850, category: "第五人格" },

  // 點卡
  { name: "貝殼幣", cost: 0, price: 0, category: "點卡", costDiscount: 0.91, priceDiscount: 0.97 },
  { name: "MyCard", cost: 0, price: 0, category: "點卡", costDiscount: 0.91, priceDiscount: 0.97 },

  // 特戰英豪
  { name: "全區11000特務幣", cost: 2510, price: 2850, category: "特戰英豪" },
  { name: "全區5350特務幣", cost: 1260, price: 1520, category: "特戰英豪" },
  { name: "全區3650特務幣", cost: 880, price: 1100, category: "特戰英豪" },
  { name: "全區2050特務幣", cost: 500, price: 630, category: "特戰英豪" },
  { name: "全區1000特務幣", cost: 250, price: 300, category: "特戰英豪" },
  { name: "全區475特務幣", cost: 130, price: 150, category: "特戰英豪" },
  { name: "全區22000特務幣", cost: 5020, price: 5600, category: "特戰英豪" },
];

async function seed() {
  console.log("Creating categories...");
  const categoryMap = new Map<string, string>();

  for (const name of categories) {
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryMap.set(name, cat.id);
    console.log(`  ✓ ${name} (${cat.id})`);
  }

  console.log(`\nCreating ${products.length} products...`);
  let created = 0;
  let skipped = 0;

  for (const p of products) {
    const categoryId = categoryMap.get(p.category)!;
    try {
      await prisma.product.upsert({
        where: { name: p.name },
        update: { cost: p.cost, price: p.price, categoryId },
        create: {
          name: p.name,
          cost: p.cost,
          price: p.price,
          categoryId,
          costDiscount: p.costDiscount,
          priceDiscount: p.priceDiscount,
          // For discount-type products, faceValue is determined per-order
        },
      });
      created++;
      console.log(`  ✓ ${p.name}`);
    } catch (err: any) {
      skipped++;
      console.log(`  ✗ ${p.name}: ${err.message}`);
    }
  }

  console.log(`\nDone! Created/updated: ${created}, Failed: ${skipped}`);
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
