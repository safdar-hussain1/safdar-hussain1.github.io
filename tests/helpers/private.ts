import { createHash } from 'node:crypto';

// Digests of the digit strings that must never appear on the site or in this repository
// (phone numbers from the private profile). Only the digests live here.
export const PRIVATE_DIGESTS = new Set<string>([
  "3688ec7fbd911846da45239cabba4e5bb1cf704c9a1ea6cfada45a620cc79581",
  "cbae259402ae99736087504182a672ffc888f38c77d30d0d282d78bd631bdb30"
]);

export function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function privateRuns(text: string): string[] {
  return (text.match(/\d{10}/g) ?? []).filter((run) => PRIVATE_DIGESTS.has(digest(run)));
}
