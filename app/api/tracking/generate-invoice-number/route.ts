import { NextResponse } from "next/server";

// Retired (owner, 2026-11): a buyer invoice number is assigned only when the
// invoice's first PDF is generated (POST /api/tracking/[id]/documents, see
// lib/invoice-number.ts). Nothing in the app calls this any more; a browser
// tab still running the old page code did, which handed out numbers without
// a PDF - so it now refuses and asks for a refresh instead.
export async function POST() {
  return NextResponse.json(
    { error: "Ship-Sphere was updated - please refresh this page (Ctrl+Shift+R). Invoice numbers are now given when the PDF is generated." },
    { status: 409 }
  );
}
