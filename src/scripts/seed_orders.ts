import "dotenv/config";
import { prisma } from "../core/db.js";

interface RawOrder {
  id: string;
  date: string; // YYYY/M/D
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  profit: number;
}

// Only 出貨紀錄 (sales), not 進貨 (procurement)
const orders: RawOrder[] = [
  // ===== 2026-01 (66 orders) =====
  { id: "NFD75N", date: "2026/1/1", productName: "Roblox 2500R", quantity: 1, unitPrice: 800, total: 800, profit: 70 },
  { id: "RXCJ66", date: "2026/1/1", productName: "Roblox 10000R", quantity: 3, unitPrice: 2900, total: 8700, profit: 750 },
  { id: "STNVD9", date: "2026/1/1", productName: "貝殼幣", quantity: 3, unitPrice: 1358, total: 4074, profit: 252 },
  { id: "BN927L", date: "2026/1/3", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "8G6ZN6", date: "2026/1/3", productName: "貝殼幣", quantity: 1, unitPrice: 1358, total: 1358, profit: 84 },
  { id: "UCA8CY", date: "2026/1/5", productName: "貝殼幣", quantity: 1, unitPrice: 1358, total: 1358, profit: 84 },
  { id: "5JZ8SA", date: "2026/1/5", productName: "Discord 登入月", quantity: 2, unitPrice: 230, total: 460, profit: 120 },
  { id: "CBKPXM", date: "2026/1/5", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "MCHL8J", date: "2026/1/5", productName: "貝殼幣", quantity: 1, unitPrice: 1358, total: 1358, profit: 84 },
  { id: "WHU42K", date: "2026/1/7", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "7F8EL4", date: "2026/1/7", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "E3FAHH", date: "2026/1/8", productName: "貝殼幣", quantity: 1, unitPrice: 1358, total: 1358, profit: 84 },
  { id: "Z7MWAD", date: "2026/1/8", productName: "Roblox 贈禮", quantity: 1, unitPrice: 243.25, total: 243.25, profit: 58.38 },
  { id: "P8LRB3", date: "2026/1/8", productName: "全區3650特務幣", quantity: 1, unitPrice: 1100, total: 1100, profit: 220 },
  { id: "8ESXSF", date: "2026/1/8", productName: "全區11000特務幣", quantity: 1, unitPrice: 2850, total: 2850, profit: 340 },
  { id: "LWKLF7", date: "2026/1/8", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "RQBC96", date: "2026/1/9", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "4QMBSG", date: "2026/1/9", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "P4Z92U", date: "2026/1/10", productName: "Discord 裝飾登入", quantity: 1, unitPrice: 890, total: 890, profit: 890 },
  { id: "XRBW4Y", date: "2026/1/10", productName: "全區11000特務幣", quantity: 1, unitPrice: 2850, total: 2850, profit: 340 },
  { id: "3ZT6L6", date: "2026/1/10", productName: "MyCard", quantity: 1, unitPrice: 5820, total: 5820, profit: 360 },
  { id: "TMH3NN", date: "2026/1/10", productName: "Discord 登入年", quantity: 1, unitPrice: 1400, total: 1400, profit: 330 },
  { id: "LX4WV6", date: "2026/1/11", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "UT5SY5", date: "2026/1/11", productName: "Discord 4.99贈禮", quantity: 1, unitPrice: 120, total: 120, profit: 50 },
  { id: "BW77HP", date: "2026/1/12", productName: "蒸氣卡 500TWD", quantity: 1, unitPrice: 550, total: 550, profit: 40 },
  { id: "CUWA38", date: "2026/1/12", productName: "全區1000特務幣", quantity: 1, unitPrice: 300, total: 300, profit: 50 },
  { id: "J32J65", date: "2026/1/12", productName: "全區11000特務幣", quantity: 1, unitPrice: 2850, total: 2850, profit: 340 },
  { id: "L8AS4G", date: "2026/1/12", productName: "三角幣 330幣", quantity: 1, unitPrice: 165, total: 165, profit: 13 },
  { id: "3TVYBG", date: "2026/1/12", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "QLVSES", date: "2026/1/13", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "ZSLZ4J", date: "2026/1/13", productName: "Discord 4.99贈禮", quantity: 1, unitPrice: 120, total: 120, profit: 50 },
  { id: "RGJGQD", date: "2026/1/13", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "L4DHTH", date: "2026/1/13", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "2DGUZN", date: "2026/1/14", productName: "米哈遊 1980點", quantity: 1, unitPrice: 800, total: 800, profit: 90 },
  { id: "YY2NEL", date: "2026/1/16", productName: "Discord 登入月", quantity: 1, unitPrice: 230, total: 230, profit: 60 },
  { id: "4LTJV9", date: "2026/1/16", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "22XKSV", date: "2026/1/16", productName: "Roblox 5000R", quantity: 1, unitPrice: 1550, total: 1550, profit: 100 },
  { id: "J2A4VG", date: "2026/1/17", productName: "傳說對決 364點卷", quantity: 1, unitPrice: 260, total: 260, profit: 32 },
  { id: "3EQS7R", date: "2026/1/17", productName: "傳說對決 728點卷", quantity: 1, unitPrice: 500, total: 500, profit: 45 },
  { id: "R6CU46", date: "2026/1/18", productName: "Roblox 2500R", quantity: 1, unitPrice: 800, total: 800, profit: 70 },
  { id: "L659NC", date: "2026/1/19", productName: "米哈遊 小月卡", quantity: 4, unitPrice: 150, total: 600, profit: 120 },
  { id: "GWPYB6", date: "2026/1/20", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "CY5JUL", date: "2026/1/20", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "T3Z2LT", date: "2026/1/20", productName: "第五人格 7590 回聲", quantity: 1, unitPrice: 2850, total: 2850, profit: 320 },
  { id: "J7XJKR", date: "2026/1/20", productName: "EXITLAG 一個月序號", quantity: 1, unitPrice: 250, total: 250, profit: 19 },
  { id: "2PBM6S", date: "2026/1/20", productName: "14次加成+4.99贈禮", quantity: 1, unitPrice: 300, total: 300, profit: 300 },
  { id: "C2K2GE", date: "2026/1/23", productName: "Discord 贈禮年", quantity: 1, unitPrice: 2600, total: 2600, profit: 300 },
  { id: "M6JPEA", date: "2026/1/23", productName: "Roblox 贈禮", quantity: 1, unitPrice: 162.25, total: 162.25, profit: 38.94 },
  { id: "KM9TXQ", date: "2026/1/24", productName: "傳說對決 72點卷", quantity: 1, unitPrice: 80, total: 80, profit: 34 },
  { id: "7T6RAX", date: "2026/1/24", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "EE49G6", date: "2026/1/24", productName: "傳說對決 4130點卷", quantity: 1, unitPrice: 2900, total: 2900, profit: 180 },
  { id: "G6H2GB", date: "2026/1/26", productName: "蒸氣卡 200TWD", quantity: 1, unitPrice: 230, total: 230, profit: 20 },
  { id: "DQGJUN", date: "2026/1/26", productName: "Discord 登入月", quantity: 1, unitPrice: 230, total: 230, profit: 60 },
  { id: "7BZ7K4", date: "2026/1/26", productName: "Spotify 一年會員", quantity: 1, unitPrice: 800, total: 800, profit: 150 },
  { id: "JPJJAL", date: "2026/1/28", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "M9FXPU", date: "2026/1/29", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "ASLY3D", date: "2026/1/30", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "7LNLAW", date: "2026/1/30", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "LM46VF", date: "2026/1/30", productName: "蒸氣卡 200TWD", quantity: 1, unitPrice: 230, total: 230, profit: 20 },
  { id: "XDXPKQ", date: "2026/1/30", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "BQYBX7", date: "2026/1/30", productName: "Discord 贈禮月", quantity: 2, unitPrice: 260, total: 520, profit: 60 },
  { id: "J7G8WB", date: "2026/1/30", productName: "Discord 登入月", quantity: 1, unitPrice: 230, total: 230, profit: 60 },
  { id: "CD4DJU", date: "2026/1/30", productName: "傳說對決 4130點卷", quantity: 1, unitPrice: 2900, total: 2900, profit: 180 },
  { id: "ZFM4UP", date: "2026/1/31", productName: "Spotify 一年會員", quantity: 1, unitPrice: 800, total: 800, profit: 150 },
  { id: "3B9G6Z", date: "2026/1/31", productName: "傳說對決 4130點卷", quantity: 1, unitPrice: 2900, total: 2900, profit: 180 },
  { id: "G65E56", date: "2026/1/31", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },

  // ===== 2026-02 (74 orders) =====
  { id: "J2P94G", date: "2026/2/1", productName: "傳說對決 4130點卷", quantity: 1, unitPrice: 2900, total: 2900, profit: 180 },
  { id: "QCQ5K4", date: "2026/2/1", productName: "Roblox 贈禮", quantity: 1, unitPrice: 700, total: 700, profit: 168 },
  { id: "QBGQ9J", date: "2026/2/1", productName: "Roblox 贈禮", quantity: 1, unitPrice: 549.75, total: 549.75, profit: 131.94 },
  { id: "P2JBTV", date: "2026/2/1", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "KJCLQ3", date: "2026/2/3", productName: "三角幣 772幣", quantity: 2, unitPrice: 320, total: 640, profit: 42 },
  { id: "D4W6NK", date: "2026/2/3", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "4BYAEL", date: "2026/2/3", productName: "Discord 登入月", quantity: 1, unitPrice: 230, total: 230, profit: 60 },
  { id: "E9ETCU", date: "2026/2/3", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "PY6CN7", date: "2026/2/4", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "FT7G43", date: "2026/2/4", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "7WT5UF", date: "2026/2/4", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "FSSKSZ", date: "2026/2/5", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "BC582L", date: "2026/2/5", productName: "Discord 4.99贈禮", quantity: 1, unitPrice: 210, total: 210, profit: 210 },
  { id: "3E6F6V", date: "2026/2/6", productName: "傳說對決 364點卷", quantity: 1, unitPrice: 260, total: 260, profit: 32 },
  { id: "EF533D", date: "2026/2/6", productName: "傳說對決 728點卷", quantity: 1, unitPrice: 500, total: 500, profit: 45 },
  { id: "YQFAFL", date: "2026/2/6", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "8SEJK2", date: "2026/2/6", productName: "三角幣 772幣", quantity: 1, unitPrice: 320, total: 320, profit: 21 },
  { id: "85D74X", date: "2026/2/6", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "WQ76U7", date: "2026/2/7", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "88WTMU", date: "2026/2/8", productName: "2032+4049三角幣", quantity: 1, unitPrice: 2345, total: 2345, profit: 91 },
  { id: "78ZU4K", date: "2026/2/10", productName: "Discord 登入月", quantity: 1, unitPrice: 230, total: 230, profit: 60 },
  { id: "BDG74K", date: "2026/2/10", productName: "全區11000特務幣", quantity: 1, unitPrice: 2850, total: 2850, profit: 340 },
  { id: "9WXRE5", date: "2026/2/10", productName: "MyCard", quantity: 1, unitPrice: 5820, total: 5820, profit: 360 },
  { id: "7W6CDB", date: "2026/2/10", productName: "三角幣 2032幣", quantity: 1, unitPrice: 785, total: 785, profit: 31 },
  { id: "HE4CVZ", date: "2026/2/10", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "WPPL44", date: "2026/2/10", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "VYBLN2", date: "2026/2/10", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "P5A5ZC", date: "2026/2/11", productName: "蒸氣卡 300TWD", quantity: 1, unitPrice: 340, total: 340, profit: 30 },
  { id: "UHGR3X", date: "2026/2/11", productName: "Discord 4.99贈禮", quantity: 1, unitPrice: 120, total: 120, profit: 50 },
  { id: "9VXSPV", date: "2026/2/11", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "BZG59H", date: "2026/2/12", productName: "第五人格 3795 回聲", quantity: 1, unitPrice: 1450, total: 1450, profit: 185 },
  { id: "DBU5F4", date: "2026/2/12", productName: "Discord 登入年", quantity: 1, unitPrice: 1400, total: 1400, profit: 330 },
  { id: "6K94AG", date: "2026/2/13", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "E6CTNA", date: "2026/2/15", productName: "Roblox 贈禮", quantity: 1, unitPrice: 486.5, total: 486.5, profit: 116.76 },
  { id: "C9C78H", date: "2026/2/15", productName: "Discord 贈禮年", quantity: 1, unitPrice: 2600, total: 2600, profit: 300 },
  { id: "MQBV3E", date: "2026/2/16", productName: "三角幣 8295", quantity: 1, unitPrice: 3160, total: 3160, profit: 124 },
  { id: "69NY6R", date: "2026/2/16", productName: "第五人格 2277 回聲", quantity: 1, unitPrice: 950, total: 950, profit: 191 },
  { id: "TW2DR7", date: "2026/2/17", productName: "三角幣 8295幣", quantity: 1, unitPrice: 3160, total: 3160, profit: 124 },
  { id: "4LT37B", date: "2026/2/17", productName: "三角幣 8295幣", quantity: 1, unitPrice: 3160, total: 3160, profit: 124 },
  { id: "ADEANM", date: "2026/2/17", productName: "Roblox 贈禮", quantity: 1, unitPrice: 905, total: 905, profit: 217.2 },
  { id: "LMPQDL", date: "2026/2/17", productName: "Roblox 贈禮", quantity: 1, unitPrice: 605.25, total: 605.25, profit: 145.26 },
  { id: "E3D47W", date: "2026/2/17", productName: "三角幣 330幣", quantity: 1, unitPrice: 165, total: 165, profit: 13 },
  { id: "F3XAY8", date: "2026/2/18", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "CJABMV", date: "2026/2/18", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "TR99ZF", date: "2026/2/18", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "YTVMZC", date: "2026/2/18", productName: "傳說對決 728點卷", quantity: 1, unitPrice: 500, total: 500, profit: 45 },
  { id: "RJ9QMC", date: "2026/2/18", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "53VVWJ", date: "2026/2/19", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "LRY2JS", date: "2026/2/19", productName: "三角幣 8295幣", quantity: 2, unitPrice: 3160, total: 6320, profit: 248 },
  { id: "NH46TU", date: "2026/2/19", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "VFLDM8", date: "2026/2/20", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "X34RRG", date: "2026/2/20", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "95SYG2", date: "2026/2/20", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "EJMKRN", date: "2026/2/21", productName: "蒸氣卡 300TWD", quantity: 1, unitPrice: 340, total: 340, profit: 30 },
  { id: "RY5R6S", date: "2026/2/22", productName: "MyCard", quantity: 1, unitPrice: 145.5, total: 145.5, profit: 9 },
  { id: "A2P79H", date: "2026/2/22", productName: "蒸氣卡 100TWD", quantity: 1, unitPrice: 120, total: 120, profit: 10 },
  { id: "B9YRGH", date: "2026/2/22", productName: "原神 6480登入", quantity: 1, unitPrice: 2350, total: 2350, profit: 50 },
  { id: "5J23Q5", date: "2026/2/22", productName: "MyCard", quantity: 1, unitPrice: 485, total: 485, profit: 30 },
  { id: "KVLMGQ", date: "2026/2/23", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "4BEKTK", date: "2026/2/23", productName: "Roblox 2500R", quantity: 1, unitPrice: 800, total: 800, profit: 70 },
  { id: "TVYA53", date: "2026/2/23", productName: "傳說對決 1466點卷", quantity: 1, unitPrice: 970, total: 970, profit: 60 },
  { id: "P2EMLD", date: "2026/2/23", productName: "傳說對決 4130點卷", quantity: 1, unitPrice: 2900, total: 2900, profit: 180 },
  { id: "GTAAZD", date: "2026/2/23", productName: "三角幣 772幣", quantity: 1, unitPrice: 320, total: 320, profit: 21 },
  { id: "N9SLJ8", date: "2026/2/23", productName: "三角幣 4049幣", quantity: 1, unitPrice: 1560, total: 1560, profit: 60 },
  { id: "MU243N", date: "2026/2/23", productName: "米哈遊 小月卡", quantity: 1, unitPrice: 150, total: 150, profit: 30 },
  { id: "U5PT94", date: "2026/2/24", productName: "蒸氣卡 650TWD", quantity: 1, unitPrice: 700, total: 700, profit: 40 },
  { id: "FZE6MP", date: "2026/2/25", productName: "Discord 贈禮年", quantity: 1, unitPrice: 2600, total: 2600, profit: 300 },
  { id: "WLNEXG", date: "2026/2/25", productName: "蒸氣卡 100TWD", quantity: 4, unitPrice: 120, total: 480, profit: 40 },
  { id: "T28EFY", date: "2026/2/26", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "DQ8E5C", date: "2026/2/26", productName: "蒸氣卡 500TWD", quantity: 1, unitPrice: 550, total: 550, profit: 40 },
  { id: "S44XZQ", date: "2026/2/27", productName: "Discord 贈禮年", quantity: 1, unitPrice: 2600, total: 2600, profit: 300 },
  { id: "GUZDU9", date: "2026/2/28", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "CPWFNC", date: "2026/2/28", productName: "Discord 登入年", quantity: 2, unitPrice: 1400, total: 2800, profit: 660 },
  { id: "EKRPR2", date: "2026/2/28", productName: "Discord 登入月", quantity: 1, unitPrice: 200, total: 200, profit: 30 },

  // ===== 2026-03 出貨 (29 orders) =====
  { id: "2TJYLU", date: "2026/3/1", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "KUAWA8", date: "2026/3/1", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "4EZVRC", date: "2026/3/1", productName: "原神 6480登入", quantity: 1, unitPrice: 2450, total: 2450, profit: 130 },
  { id: "2DP547", date: "2026/3/1", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "LGDG4K", date: "2026/3/1", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "B9LB4S", date: "2026/3/2", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "MWGTR4", date: "2026/3/3", productName: "Discord 登入月", quantity: 1, unitPrice: 200, total: 200, profit: 30 },
  { id: "DX6THC", date: "2026/3/3", productName: "Discord 登入年", quantity: 1, unitPrice: 1400, total: 1400, profit: 330 },
  { id: "GG663J", date: "2026/3/3", productName: "MyCard", quantity: 1, unitPrice: 630.5, total: 630.5, profit: 39 },
  { id: "KP2ER7", date: "2026/3/3", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "LP7GAL", date: "2026/3/3", productName: "米哈遊 小月卡", quantity: 1, unitPrice: 150, total: 150, profit: 30 },
  { id: "HFUNUB", date: "2026/3/5", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "DXE7C8", date: "2026/3/6", productName: "MyCard", quantity: 1, unitPrice: 2910, total: 2910, profit: 180 },
  { id: "F4YUWV", date: "2026/3/6", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "BB2848", date: "2026/3/6", productName: "Roblox 2000R", quantity: 1, unitPrice: 650, total: 650, profit: 70 },
  { id: "MLGW9G", date: "2026/3/6", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
  { id: "AFZXF9", date: "2026/3/6", productName: "三角幣 4049幣", quantity: 1, unitPrice: 1560, total: 1560, profit: 60 },
  { id: "H5Q4MB", date: "2026/3/8", productName: "Discord 贈禮月", quantity: 3, unitPrice: 260, total: 780, profit: 90 },
  { id: "9MRGQY", date: "2026/3/8", productName: "Roblox 10000R", quantity: 1, unitPrice: 2900, total: 2900, profit: 250 },
  { id: "26LNL8", date: "2026/3/8", productName: "Roblox 500R", quantity: 1, unitPrice: 180, total: 180, profit: 30 },
  { id: "MEXB6Z", date: "2026/3/9", productName: "Discord 登入月", quantity: 1, unitPrice: 200, total: 200, profit: 30 },
  { id: "WWRDKJ", date: "2026/3/9", productName: "Minecraft 序號", quantity: 1, unitPrice: 700, total: 700, profit: 214 },
  { id: "FPGA64", date: "2026/3/9", productName: "三角幣 772+2032幣", quantity: 1, unitPrice: 1105, total: 1105, profit: 52 },
  { id: "GCJVXF", date: "2026/3/10", productName: "MyCard", quantity: 1, unitPrice: 2910, total: 2910, profit: 180 },
  { id: "JSAHUR", date: "2026/3/10", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "55WCCG", date: "2026/3/11", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "T3QSSV", date: "2026/3/11", productName: "蒸氣卡 300TWD", quantity: 1, unitPrice: 340, total: 340, profit: 30 },
  { id: "9JKNN6", date: "2026/3/12", productName: "Roblox 1000R", quantity: 1, unitPrice: 360, total: 360, profit: 60 },
  { id: "6W94PW", date: "2026/3/13", productName: "Discord 贈禮月", quantity: 1, unitPrice: 260, total: 260, profit: 30 },
];

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("/").map(Number);
  return new Date(y, m - 1, d);
}

async function seed() {
  // Build product name -> id map
  const products = await prisma.product.findMany();
  const productMap = new Map<string, string>();
  for (const p of products) {
    productMap.set(p.name, p.id);
  }

  console.log(`Loaded ${productMap.size} registered products`);
  console.log(`Importing ${orders.length} orders...\n`);

  let created = 0;
  let skipped = 0;
  let customCount = 0;
  const customNames = new Set<string>();

  for (const o of orders) {
    // Check if order ID already exists
    const exists = await prisma.order.findUnique({ where: { id: o.id } });
    if (exists) {
      skipped++;
      continue;
    }

    const productId = productMap.get(o.productName);
    const isCustom = !productId;
    const actualPrice = o.unitPrice;
    const actualCost = actualPrice - o.profit / o.quantity;

    if (isCustom) {
      customCount++;
      customNames.add(o.productName);
    }

    try {
      await prisma.order.create({
        data: {
          id: o.id,
          productId: productId ?? undefined,
          productName: o.productName,
          quantity: o.quantity,
          actualPrice,
          actualCost,
          profit: o.profit,
          isCustom,
          createdAt: parseDate(o.date),
        },
      });
      created++;
      const tag = isCustom ? " [自訂]" : "";
      console.log(`  ✓ #${o.id} ${o.date} ${o.productName} x${o.quantity}${tag}`);
    } catch (err: any) {
      console.log(`  ✗ #${o.id} ${o.productName}: ${err.message}`);
    }
  }

  console.log(`\n========== 結果 ==========`);
  console.log(`匯入成功: ${created}`);
  console.log(`已存在跳過: ${skipped}`);
  console.log(`自訂訂單: ${customCount}`);
  if (customNames.size > 0) {
    console.log(`\n未登記的商品名稱（以自訂訂單處理）:`);
    for (const name of customNames) {
      console.log(`  - ${name}`);
    }
  }

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
