// Gemini is told to copy a header back verbatim (see lib/gemini.ts
// suggestMapping), but it isn't always byte-for-byte exact - a trimmed
// space or a casing slip is enough. Every import's mapping screen used
// to check `headers.includes(suggested)` directly, so any mismatch
// silently fell back to "- Skip -" with nothing telling the user the
// AI actually did find a match. Confirmed live: a forwarder invoice
// sheet with "FREIGHT CHARGES" imported 19 brand-new bookings but
// every charge field came through as 0 - the suggestion existed, it
// just wasn't recognized. Matching case/whitespace-insensitively (and
// returning the REAL header string, so the field still has a valid
// dropdown value) fixes this without weakening the review step itself.
export function resolveSuggestedHeader(headers: string[], suggested: string | null | undefined): string | null {
  if (!suggested) return null;
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = normalize(suggested);
  return headers.find((h) => normalize(h) === target) ?? null;
}
