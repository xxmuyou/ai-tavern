import type { TimeSlot } from "./types";

// Time-slot logic for daily-life sim. Two callers care:
//   1. computeDateLocal  -> the "story day" key for daily_state cache rows
//   2. computeTimeSlot   -> which of the 4 windows the user is currently in
//
// The day boundary is local 05:00 (not midnight) so a player opening the app
// at 02:00 still sees "tonight" — matches docs/product/daily-life-sim.md.

const FALLBACK_TZ = "UTC";

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return FALLBACK_TZ;
  try {
    // Throws RangeError on invalid IANA strings.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return FALLBACK_TZ;
  }
}

export function getLocalParts(now: Date, tz: string): LocalParts {
  const zone = safeTimeZone(tz);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const out: Partial<LocalParts> = {};
  for (const part of fmt.formatToParts(now)) {
    switch (part.type) {
      case "year": out.year = Number(part.value); break;
      case "month": out.month = Number(part.value); break;
      case "day": out.day = Number(part.value); break;
      case "hour": {
        // Intl returns "24" at midnight in some Node builds; normalise to 0.
        const raw = Number(part.value);
        out.hour = raw === 24 ? 0 : raw;
        break;
      }
      case "minute": out.minute = Number(part.value); break;
      case "second": out.second = Number(part.value); break;
      default: break;
    }
  }

  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

export function computeTimeSlot(now: Date, tz: string): TimeSlot {
  const { hour } = getLocalParts(now, tz);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night"; // 22-04 inclusive
}

// Compute the local "story day" identifier as YYYY-MM-DD. The story day rolls
// over at local 05:00, so 02:30 still counts as the previous day.
export function computeDateLocal(now: Date, tz: string): string {
  const local = getLocalParts(now, tz);
  // Treat the local clock as if it were UTC so date arithmetic doesn't
  // double-apply the timezone offset, then subtract 5h to find the story day.
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const shifted = new Date(asUtc - 5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
