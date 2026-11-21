// Free trial (owner, 2026-11): a company on "trial" with a trial_ends_at
// date can use Ship-Sphere up to and including that date. From 5 days
// before it, users see a daily recharge popup (components/TrialNotice.tsx);
// after it, getCurrentProfile() treats them as signed out and the app shows
// a "trial ended" screen until the platform owner sets the company Active.
// Dates are counted in India time (the owner's), as calendar days.

export const TRIAL_WARNING_DAYS = 5;

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

/** Days from today until the trial end date: 0 = last day, negative = ended. */
export function trialDaysLeft(trialEndsAt: string | null | undefined, today = todayIST()): number | null {
  if (!trialEndsAt) return null;
  const end = Date.UTC(+trialEndsAt.slice(0, 4), +trialEndsAt.slice(5, 7) - 1, +trialEndsAt.slice(8, 10));
  const now = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((end - now) / 86400000);
}

/** null when the company isn't on a dated trial. */
export function trialState(status: string | null | undefined, trialEndsAt: string | null | undefined) {
  if (status !== "trial" || !trialEndsAt) return null;
  const daysLeft = trialDaysLeft(trialEndsAt)!;
  return { endsAt: trialEndsAt.slice(0, 10), daysLeft, expired: daysLeft < 0 };
}

export const OWNER_NOTIFY_EMAIL = process.env.DEMO_REQUEST_TO || "tanishqarora321@gmail.com";
