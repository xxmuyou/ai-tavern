/**
 * Tiny className joiner — filters out falsy values and joins with spaces.
 * Equivalent to `clsx` for our minimal needs.
 */
export type ClassValue = string | number | false | null | undefined | Record<string, boolean | null | undefined>;

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      out.push(String(v));
    } else if (typeof v === 'object') {
      for (const key of Object.keys(v)) {
        if (v[key]) out.push(key);
      }
    }
  }
  return out.join(' ');
}
