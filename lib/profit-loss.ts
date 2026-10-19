// Shared aggregation for the Profit & Loss page - both the booking-number
// view (buyer invoice total minus forwarder+supplier+trucker expenses,
// per Tanishq's own formula) and the party-wise view (invoiced vs. paid,
// reusing Payment History's data for Forwarders/Suppliers/Truckers).
//
// forwarder_invoices.total_usd and trucker_invoices.total_usd are
// Postgres GENERATED columns over only their 6 fixed charge columns -
// they can't reference the custom_charges jsonb blob (a generated column
// can't reference another generated column), so the real total has to
// add custom_charges back in here, exactly like each ledger's own
// invoiceTotalUsd() already does (components/InvoiceLedgerClient.tsx /
// TruckerInvoiceLedgerClient.tsx). Supplier/Buyer have no custom_charges
// concept at all - their total_usd as stored is already the real total.
//
// booking_number is a plain copied text column on all four tables (not
// a foreign key), auto-filled from bookings.carrier_booking_no but also
// sometimes typed in by hand (Supplier/Buyer's manual-entry fallback) -
// grouped here by lower(trim(...)) so casing/spacing drift between
// tables doesn't split one real booking into two rows.

export type PartyPL = {
  party_id: string;
  legal_name: string;
  role: "forwarder" | "supplier" | "trucker" | "buyer";
  invoiced_usd: number;
  paid_usd: number;
  net_usd: number; // invoiced - paid (payable parties) or still-unpaid (buyer)
};

export type BookingPL = {
  booking_number: string;
  buyer_usd: number;
  forwarder_usd: number;
  supplier_usd: number;
  trucker_usd: number;
  expenses_usd: number;
  net_usd: number;
};

function normBooking(s: string | null): string | null {
  const t = (s ?? "").trim().toLowerCase();
  return t || null;
}

// year: null means "all years, no filtering" - otherwise every invoice
// row is filtered by its OWN invoice_date's year, and every payment by
// its own applies_to_year (never by paid_on), before aggregating.
export async function computeProfitLoss(supabase: any, companyId: string, year: number | null) {
  const [
    { data: fwdInvoices },
    { data: truckerInvoices },
    { data: supplierInvoices },
    { data: buyerInvoices },
    { data: fwdCustomCols },
    { data: truckerCustomCols },
    { data: payments },
    { data: parties },
  ] = await Promise.all([
    supabase.from("forwarder_invoices").select("id, forwarder_id, booking_number, invoice_date, total_usd, fx_rate, custom_charges").eq("company_id", companyId),
    supabase.from("trucker_invoices").select("id, trucker_id, booking_number, invoice_date, total_usd, fx_rate, custom_charges").eq("company_id", companyId),
    supabase.from("supplier_invoices").select("id, supplier_id, booking_number, invoice_date, total_usd").eq("company_id", companyId),
    supabase.from("buyer_invoices").select("id, buyer_id, booking_number, invoice_date, total_usd, paid_status").eq("company_id", companyId),
    supabase.from("forwarder_invoice_custom_columns").select("key").eq("company_id", companyId),
    supabase.from("trucker_invoice_custom_columns").select("key").eq("company_id", companyId),
    supabase.from("party_payments").select("party_id, amount, fx_rate, applies_to_year").eq("company_id", companyId),
    supabase.from("parties").select("id, legal_name, roles").eq("company_id", companyId),
  ]);

  function matchesYear(dateStr: string | null) {
    if (year == null) return true;
    if (!dateStr) return false;
    return new Date(dateStr).getFullYear() === year;
  }

  const fwdKeys = (fwdCustomCols ?? []).map((c: any) => c.key);
  const truckerKeys = (truckerCustomCols ?? []).map((c: any) => c.key);

  function customSum(customCharges: Record<string, number> | null, keys: string[], fxRate: number) {
    return keys.reduce((s, k) => s + (Number(customCharges?.[k]) || 0), 0) * (fxRate || 1);
  }

  const fwdRows = (fwdInvoices ?? [])
    .filter((inv: any) => matchesYear(inv.invoice_date))
    .map((inv: any) => ({
      party_id: inv.forwarder_id,
      booking_number: inv.booking_number,
      invoice_date: inv.invoice_date,
      usd: Number(inv.total_usd || 0) + customSum(inv.custom_charges, fwdKeys, inv.fx_rate),
    }));
  const truckerRows = (truckerInvoices ?? [])
    .filter((inv: any) => matchesYear(inv.invoice_date))
    .map((inv: any) => ({
      party_id: inv.trucker_id,
      booking_number: inv.booking_number,
      invoice_date: inv.invoice_date,
      usd: Number(inv.total_usd || 0) + customSum(inv.custom_charges, truckerKeys, inv.fx_rate),
    }));
  const supplierRows = (supplierInvoices ?? [])
    .filter((inv: any) => matchesYear(inv.invoice_date))
    .map((inv: any) => ({
      party_id: inv.supplier_id,
      booking_number: inv.booking_number,
      invoice_date: inv.invoice_date,
      usd: Number(inv.total_usd || 0),
    }));
  const buyerRows = (buyerInvoices ?? [])
    .filter((inv: any) => matchesYear(inv.invoice_date))
    .map((inv: any) => ({
      party_id: inv.buyer_id,
      booking_number: inv.booking_number,
      invoice_date: inv.invoice_date,
      usd: Number(inv.total_usd || 0),
      paid_status: inv.paid_status,
    }));

  // ---- Booking-number-wise ----
  const byBooking = new Map<string, BookingPL & { display: string }>();
  function addToBooking(bookingNumber: string | null, field: "buyer_usd" | "forwarder_usd" | "supplier_usd" | "trucker_usd", usd: number) {
    const key = normBooking(bookingNumber);
    if (!key) return;
    if (!byBooking.has(key)) {
      byBooking.set(key, { booking_number: key, display: bookingNumber!, buyer_usd: 0, forwarder_usd: 0, supplier_usd: 0, trucker_usd: 0, expenses_usd: 0, net_usd: 0 });
    }
    byBooking.get(key)![field] += usd;
  }
  for (const r of buyerRows) addToBooking(r.booking_number, "buyer_usd", r.usd);
  for (const r of fwdRows) addToBooking(r.booking_number, "forwarder_usd", r.usd);
  for (const r of supplierRows) addToBooking(r.booking_number, "supplier_usd", r.usd);
  for (const r of truckerRows) addToBooking(r.booking_number, "trucker_usd", r.usd);

  const bookingPL: BookingPL[] = Array.from(byBooking.values()).map((b) => {
    const expenses_usd = b.forwarder_usd + b.supplier_usd + b.trucker_usd;
    return { booking_number: b.display, buyer_usd: b.buyer_usd, forwarder_usd: b.forwarder_usd, supplier_usd: b.supplier_usd, trucker_usd: b.trucker_usd, expenses_usd, net_usd: b.buyer_usd - expenses_usd };
  });

  // ---- Party-wise ----
  const partyById = new Map<string, { legal_name: string; roles: string[] }>((parties ?? []).map((p: any) => [p.id, { legal_name: p.legal_name, roles: p.roles ?? [] }]));
  const paidByParty = new Map<string, number>();
  for (const p of payments ?? []) {
    if (year != null && p.applies_to_year !== year) continue;
    paidByParty.set(p.party_id, (paidByParty.get(p.party_id) ?? 0) + Number(p.amount || 0) * (p.fx_rate || 1));
  }

  function aggregateByParty(rows: { party_id: string; usd: number }[], role: PartyPL["role"]): PartyPL[] {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.party_id, (totals.get(r.party_id) ?? 0) + r.usd);
    return Array.from(totals.entries()).map(([party_id, invoiced_usd]) => {
      const paid_usd = paidByParty.get(party_id) ?? 0;
      return {
        party_id,
        legal_name: partyById.get(party_id)?.legal_name ?? "Unknown",
        role,
        invoiced_usd,
        paid_usd,
        net_usd: invoiced_usd - paid_usd,
      };
    });
  }

  const buyerPaidUsd = new Map<string, number>();
  for (const r of buyerRows) {
    if (r.paid_status === "PAID") buyerPaidUsd.set(r.party_id, (buyerPaidUsd.get(r.party_id) ?? 0) + r.usd);
  }
  const buyerTotals = new Map<string, number>();
  for (const r of buyerRows) buyerTotals.set(r.party_id, (buyerTotals.get(r.party_id) ?? 0) + r.usd);
  const buyerPartyPL: PartyPL[] = Array.from(buyerTotals.entries()).map(([party_id, invoiced_usd]) => {
    const paid_usd = buyerPaidUsd.get(party_id) ?? 0;
    return {
      party_id,
      legal_name: partyById.get(party_id)?.legal_name ?? "Unknown",
      role: "buyer",
      invoiced_usd,
      paid_usd,
      net_usd: invoiced_usd - paid_usd, // still unpaid/outstanding, for a buyer this is a receivable
    };
  });

  const partyPL: PartyPL[] = [
    ...aggregateByParty(fwdRows, "forwarder"),
    ...aggregateByParty(supplierRows, "supplier"),
    ...aggregateByParty(truckerRows, "trucker"),
    ...buyerPartyPL,
  ];

  return { bookingPL, partyPL };
}
