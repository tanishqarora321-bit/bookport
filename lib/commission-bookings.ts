import { normalizeContainerNo } from "@/lib/import-booking-fields";

export type CommissionBooking = {
  id: string;
  booking_number: string | null;
  container_number: string | null;
  commission_party: string | null;
  commission_amount: number;
  month_of_loading: string; // YYYY-MM-01
  created_at?: string;
};

// Validates / tidies the editable fields of a Commission Booking. `full`:
// a new one (booking or container number and an amount needed).
export function cleanCommissionFields(body: any, full: boolean): { values: Record<string, any> } | { error: string } {
  const v: Record<string, any> = {};
  const text = (x: any) => {
    const t = String(x ?? "").replace(/\s+/g, " ").trim();
    return t || null;
  };
  if ("booking_number" in body) v.booking_number = text(body.booking_number);
  if ("container_number" in body) v.container_number = text(body.container_number) ? normalizeContainerNo(body.container_number) : null;
  if ("commission_party" in body) v.commission_party = text(body.commission_party);
  if ("commission_amount" in body) {
    const n = Number(String(body.commission_amount ?? "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(n) || String(body.commission_amount ?? "").trim() === "") return { error: "Commission Amount must be a number" };
    v.commission_amount = Math.round(n * 100) / 100;
  }
  if ("month_of_loading" in body) {
    const m = String(body.month_of_loading ?? "").trim();
    const ym = m.match(/^(\d{4})-(\d{2})/);
    if (!ym) return { error: "Month of Loading is required" };
    v.month_of_loading = `${ym[1]}-${ym[2]}-01`;
  }
  if (full) {
    if (!v.booking_number && !v.container_number) return { error: "Enter a Booking Number or a Container Number" };
    if (v.commission_amount === undefined) return { error: "Enter the Commission Amount" };
    if (!v.month_of_loading) return { error: "Month of Loading is required" };
  }
  return { values: v };
}
