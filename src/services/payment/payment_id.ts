import { customAlphabet } from "nanoid";
import { prisma } from "../../core/db.js";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateShort = customAlphabet(alphabet, 4);

function hashGuildId(guildId: string): string {
  let hash = 0;
  for (const ch of guildId) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 4).padStart(4, "0");
}

function timestampPart(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yy}${MM}${dd}${HH}${mm}${ss}`;
}

export async function generatePaymentOrderId(guildId: string): Promise<string> {
  const guildHash = hashGuildId(guildId);
  const ts = timestampPart();

  for (let i = 0; i < 10; i++) {
    const id = `PAY-${guildHash}-${ts}-${generateShort()}`;
    const exists = await prisma.paymentTransaction.findUnique({
      where: { orderId: id },
    });
    if (!exists) return id;
  }
  throw new Error("Failed to generate unique payment order ID after 10 attempts");
}
