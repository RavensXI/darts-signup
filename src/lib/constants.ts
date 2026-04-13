export const CLUB_NIGHTS = [
  { day: "Monday", yearGroup: "Y7" },
  { day: "Tuesday", yearGroup: "Y8" },
  { day: "Thursday", yearGroup: "Y9" },
  { day: "Friday", yearGroup: "Y10" },
] as const;

export const MAX_CONFIRMED = 18;
export const MAX_RESERVE = 2;
export const MAX_TOTAL = MAX_CONFIRMED + MAX_RESERVE;

export type ClubNight = (typeof CLUB_NIGHTS)[number];
export type DayName = ClubNight["day"];
export type YearGroup = ClubNight["yearGroup"];

export interface Signup {
  id: string;
  initials: string;
  year_group: string;
  club_night: string;
  status: "Confirmed" | "Reserve";
  created_at: string;
}

export interface Settings {
  id: number;
  admin_pin: string;
  signups_open: boolean;
  announcement: string | null;
  signup_hours_before: number | null;
  club_night_time: string | null; // "HH:MM" format
}

export const DAY_TO_NUMBER: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Thursday: 4,
  Friday: 5,
};
