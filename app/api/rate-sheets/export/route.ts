import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/session";
import { buildFreightWorkbook } from "@/lib/freight-workbook";

// Freight Comparison > Download Excel (owner, 2026-11): the same sheet the
// owner builds by hand ("FREIGHT COMPARISON - MUNDRA | OCTOBER 2026 |
// 40HC"): origins x "Forwarder - Line" with each forwarder's add-on
// included, the cheapest per origin green, the best value (cheapest with
// enough free days) blue, Lowest Rate / Lowest Forwarder / Line columns, a
// Notes & Charges sheet and each forwarder's original rates.

export async function GET(req: NextRequest) {
  const me = await getCurrentProfile();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") || "";
  const destination = req.nextUrl.searchParams.get("destination") || "Mundra, IN";
  const minFree = Number(req.nextUrl.searchParams.get("minFree")) || 10;
  if (!/^\d{4}-\d{2}/.test(month)) return NextResponse.json({ error: "month is required" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: sheets, error } = await supabase
    .from("rate_sheets")
    .select("*, entries:rate_sheet_entries (origin, shipping_line, rate, free_days, sort_order)")
    .eq("company_id", me.company_id)
    .eq("rate_month", `${month.slice(0, 7)}-01`)
    .eq("destination", destination)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { wb, monthLabel, port } = buildFreightWorkbook(sheets ?? [], month, destination, minFree);
  const buf = await wb.xlsx.writeBuffer();
  const file = `Freight_Comparison_${monthLabel.replace(/\s+/g, "_")}_${port}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
