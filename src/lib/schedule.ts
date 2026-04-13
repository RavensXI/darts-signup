import { CLUB_NIGHTS, DAY_TO_NUMBER, type Settings } from "./constants";

/**
 * Get the next occurrence of a given weekday at a given time,
 * looking at this week and next week relative to `now`.
 */
function getNextOccurrence(dayNumber: number, hour: number, minute: number, now: Date): Date {
  const today = now.getDay(); // 0=Sun, 1=Mon, ...
  let diff = dayNumber - today;
  if (diff < 0) diff += 7;

  const occurrence = new Date(now);
  occurrence.setDate(occurrence.getDate() + diff);
  occurrence.setHours(hour, minute, 0, 0);

  // If it's already passed today, move to next week
  if (occurrence <= now) {
    occurrence.setDate(occurrence.getDate() + 7);
  }

  return occurrence;
}

/**
 * Get the most recent or upcoming occurrence of a weekday
 * that could still have an active signup window.
 * Returns both this week's and next week's to check both windows.
 */
function getRelevantOccurrences(dayNumber: number, hour: number, minute: number, now: Date): Date[] {
  const today = now.getDay();
  let diff = dayNumber - today;
  if (diff < 0) diff += 7;

  // This week's occurrence
  const thisWeek = new Date(now);
  thisWeek.setDate(thisWeek.getDate() + diff);
  thisWeek.setHours(hour, minute, 0, 0);

  // Last week's occurrence
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);

  // Next week's occurrence
  const nextWeek = new Date(thisWeek);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return [lastWeek, thisWeek, nextWeek];
}

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { hour: h, minute: m };
}

/**
 * Determine whether signups should currently be open based on settings.
 * - If scheduling is not configured (signup_hours_before is null), falls back to signups_open boolean.
 * - If signups_open is false, that's a manual override — always closed.
 * - Otherwise, checks if the current time falls within any club night's signup window.
 */
export function areSignupsOpen(settings: Settings): boolean {
  // No scheduling configured — use manual toggle
  if (settings.signup_hours_before == null) {
    return settings.signups_open;
  }

  // Manual override to close
  if (!settings.signups_open) {
    return false;
  }

  const now = new Date();
  const { hour, minute } = parseTime(settings.club_night_time || "15:30");
  const hoursBefore = settings.signup_hours_before;

  for (const night of CLUB_NIGHTS) {
    const dayNum = DAY_TO_NUMBER[night.day];
    const occurrences = getRelevantOccurrences(dayNum, hour, minute, now);

    for (const clubTime of occurrences) {
      const openTime = new Date(clubTime.getTime() - hoursBefore * 60 * 60 * 1000);
      if (now >= openTime && now < clubTime) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns info about which nights currently have open signup windows.
 */
export function getOpenNights(settings: Settings): string[] {
  if (settings.signup_hours_before == null) return [];

  const now = new Date();
  const { hour, minute } = parseTime(settings.club_night_time || "15:30");
  const hoursBefore = settings.signup_hours_before;
  const openNights: string[] = [];

  for (const night of CLUB_NIGHTS) {
    const dayNum = DAY_TO_NUMBER[night.day];
    const occurrences = getRelevantOccurrences(dayNum, hour, minute, now);

    for (const clubTime of occurrences) {
      const openTime = new Date(clubTime.getTime() - hoursBefore * 60 * 60 * 1000);
      if (now >= openTime && now < clubTime) {
        openNights.push(night.day);
        break;
      }
    }
  }

  return openNights;
}

/**
 * Get the next time signups will open (for showing to students when signups are closed).
 */
export function getNextOpenTime(settings: Settings): Date | null {
  if (settings.signup_hours_before == null) return null;

  const now = new Date();
  const { hour, minute } = parseTime(settings.club_night_time || "15:30");
  const hoursBefore = settings.signup_hours_before;
  let earliest: Date | null = null;

  for (const night of CLUB_NIGHTS) {
    const dayNum = DAY_TO_NUMBER[night.day];
    const occurrences = getRelevantOccurrences(dayNum, hour, minute, now);

    for (const clubTime of occurrences) {
      const openTime = new Date(clubTime.getTime() - hoursBefore * 60 * 60 * 1000);
      // Only consider future open times
      if (openTime > now) {
        if (!earliest || openTime < earliest) {
          earliest = openTime;
        }
      }
    }
  }

  return earliest;
}

/**
 * Generate a preview of when each club night's signups open (for the admin panel).
 */
export function getSchedulePreview(
  hoursBefore: number,
  clubNightTime: string
): { day: string; yearGroup: string; opensAt: Date; clubTime: Date }[] {
  const now = new Date();
  const { hour, minute } = parseTime(clubNightTime);
  const previews: { day: string; yearGroup: string; opensAt: Date; clubTime: Date }[] = [];

  for (const night of CLUB_NIGHTS) {
    const dayNum = DAY_TO_NUMBER[night.day];
    const clubTime = getNextOccurrence(dayNum, hour, minute, now);
    const opensAt = new Date(clubTime.getTime() - hoursBefore * 60 * 60 * 1000);

    previews.push({
      day: night.day,
      yearGroup: night.yearGroup,
      opensAt,
      clubTime,
    });
  }

  return previews.sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
}
