import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/supabase/session";

// Best-effort live FX lookup so entering a non-USD invoice pre-fills a
// sensible conversion rate - always shown as an editable field, never
// silently trusted, since this is a free public rate (open.er-api.com,
// no key required) and not a certified financial feed.
export async function GET(req: NextRequest) {
  if (!(await getCurrentProfile())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from")?.toUpperCase();
  const to = req.nextUrl.searchParams.get("to")?.toUpperCase() || "USD";
  if (!from) return NextResponse.json({ error: "from is required" }, { status: 400 });
  // Currency codes only - the value goes into an outgoing URL.
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return NextResponse.json({ error: "Use a 3-letter currency code" }, { status: 400 });
  if (from === to) return NextResponse.json({ rate: 1 });

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, { next: { revalidate: 3600 } });
    const json = await res.json();
    const rate = json?.rates?.[to];
    if (!rate) return NextResponse.json({ error: `No rate found for ${from} -> ${to}` }, { status: 502 });
    return NextResponse.json({ rate });
  } catch (err: any) {
    return NextResponse.json({ error: `Rate lookup failed: ${err.message}` }, { status: 502 });
  }
}
