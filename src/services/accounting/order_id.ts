import { customAlphabet } from "nanoid";
import { prisma } from "../../core/db.js";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generate = customAlphabet(alphabet, 6);

export async function generateOrderId(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const id = generate();
    const exists = await prisma.order.findUnique({ where: { id } });
    if (!exists) return id;
  }
  throw new Error("Failed to generate unique order ID after 10 attempts");
}
