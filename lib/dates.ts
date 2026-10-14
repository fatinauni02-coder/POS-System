// Dates in MALAYSIA time — shared by Order history and Stock history.
// (Moved here from app/history/page.tsx so both pages use the same code.)

export const TZ = "Asia/Kuala_Lumpur";

// "2026-10-13" for a moment in time, in Malaysia (en-CA happens to write dates as YYYY-MM-DD)
export function dayInKL(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

// the day before / after "2026-10-13"
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00+08:00`);
  d.setDate(d.getDate() + n);
  return dayInKL(d);
}