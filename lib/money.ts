// All money in the app is counted in SEN (whole numbers): RM 12.50 = 1250.
// Computers make tiny mistakes with decimals (0.1 + 0.2 = 0.30000000000000004),
// whole numbers never do.

/** Price from the database ("12.50" or 12.5) → sen (1250) */
export function toSen(rm:number | string | null): number{
    return Math.round(Number(rm ?? 0) *100);
}

/** Sen (1250) → text for the screen ("RM 12.50") */
export function formatRM(sen: number): string {
  return `RM ${(sen / 100).toFixed(2)}`;
}

/** Cash rounding (Bank Negara): totals go to the nearest 5 sen.
 *  Ends in 1 or 2 sen → round down; 3 or 4 sen → round up.
 *  Returns the ADJUSTMENT in sen: 1001 → -1, 1003 → +2, 1005 → 0 */
export function cashRound(sen: number): number {
  const r = sen % 5;
  if (r === 0) return 0;
  return r <= 2 ? -r : 5 - r;
}

export const DISCOUNTS = [5, 10, 15, 20];