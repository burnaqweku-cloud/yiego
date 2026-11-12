import type { AfaDetails } from "@/lib/services";

/* The MTN AFA form: shaping and checking what is typed. The database checks everything again. */

export const onlyDigits = (v: string) => v.replace(/\D/g, "");
export const validGhanaPhone = (v: string) => /^0\d{9}$/.test(onlyDigits(v));
/** AFA is MTN only: 024, 025, 053, 054, 055, 059. */
export const validMtnPhone = (v: string) => /^0(24|25|53|54|55|59)\d{7}$/.test(onlyDigits(v));
/** Shapes what is typed into GHA-123456789-0. */
export function formatGhanaCard(value: string): string {
  const numbers = onlyDigits(value.toUpperCase().replace(/^GHA/, "")).slice(0, 10);
  if (!numbers && !/^G/i.test(value)) return "";
  return `GHA-${numbers.slice(0, 9)}${numbers.length > 9 ? `-${numbers.slice(9)}` : ""}`;
}
const validCard = (v: string) => /^GHA-\d{9}-\d$/.test(v);
/** The latest birth date allowed: 16 years ago today. */
export const latestBirth = (today = new Date()) => { const d = new Date(today); d.setFullYear(d.getFullYear() - 16); return d.toISOString().slice(0, 10); };

/** The first thing wrong with the form, in plain words, or null when it is ready. */
export function afaProblem(f: AfaDetails, today = new Date()): string | null {
  if (!/^[A-Za-z][A-Za-z .'-]+ [A-Za-z .'-]+$/.test(f.full_name.trim().replace(/\s+/g, " "))) return "Enter the full name as it is on the Ghana Card: first name and surname.";
  if (!validGhanaPhone(f.afa_phone)) return "Enter the 10-digit MTN number to register.";
  if (!validMtnPhone(f.afa_phone)) return "AFA is for MTN numbers only: 024, 025, 053, 054, 055 or 059.";
  if (!validCard(f.ghana_card)) return "Enter the Ghana Card number. It looks like GHA-123456789-0.";
  if (!f.dob || f.dob > latestBirth(today) || f.dob < "1900-01-01") return "Enter the date of birth. The person must be 16 or older.";
  if (f.occupation.trim().length < 2) return "Enter the person's occupation.";
  if (!f.region) return "Choose the region.";
  if (f.address.trim().length < 5) return "Enter the address: town and area or house number.";
  return null;
}
