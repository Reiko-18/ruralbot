/**
 * Build SmilePay verification code (Mid_smilepay) for callback validation.
 *
 * Algorithm from official SmilePay docs:
 * A = 商家驗證參數 (4 digits, zero-padded)
 * B = 收款金額 (8 digits, zero-padded)
 * C = last 4 chars of Smseid (non-digits replaced with 9)
 * D = A + B + C concatenated
 * E = sum of even-position digits (1-indexed) × 3
 * F = sum of odd-position digits (1-indexed) × 9
 * Verify code = E + F
 */
export function buildMidSmilepay(params: {
  merchantVerifyParam: string; // 商家驗證參數 (4碼)
  amount: number;
  smseid: string;
}): number {
  const A = params.merchantVerifyParam.padStart(4, "0").slice(0, 4);
  const B = String(params.amount).padStart(8, "0").slice(0, 8);
  const last4 = params.smseid.slice(-4);
  const C = last4
    .split("")
    .map((ch) => (/\d/.test(ch) ? ch : "9"))
    .join("")
    .padStart(4, "0");

  const D = A + B + C; // 16 characters

  let evenSum = 0;
  let oddSum = 0;
  for (let i = 0; i < D.length; i++) {
    const digit = parseInt(D[i], 10) || 0;
    if ((i + 1) % 2 === 0) {
      evenSum += digit;
    } else {
      oddSum += digit;
    }
  }

  return evenSum * 3 + oddSum * 9;
}
