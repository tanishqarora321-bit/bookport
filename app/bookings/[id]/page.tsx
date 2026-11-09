import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import DatesCard from "./DatesCard";
import BookingActions from "./BookingActions";
import EditableCell from "@/components/EditableCell";
import StatusPill from "@/components/ui/StatusPill";
import BookingStatusTimeline, { type TimelineStage } from "@/components/BookingStatusTimeline";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

type InvoiceSummary = { count: number; total: number; paid: number; pending: number };

// booking_number on the four invoice tables is a plain copied text column,
// not a foreign key (see lib/profit-loss.ts) - matched case-insensitively
// here for the same reason that file normalizes it. Also counts each
// invoice's state, so Connected Records can say Paid / Unpaid / Pending
// rather than just showing an amount.
async function summarizeInvoices(supabase: any, table: string, bookingNumber: string, companyId: string, customKeys: string[] = []): Promise<InvoiceSummary> {
  const { data } = await supabase
    .from(table)
    .select(`id, total_usd, paid_status, invoice_number${customKeys.length ? ", custom_charges, fx_rate" : ""}`)
    .eq("company_id", companyId)
    .ilike("booking_number", bookingNumber);
  const rows = data ?? [];
  const total = rows.reduce((sum: number, r: any) => {
    const custom = customKeys.reduce((s, k) => s + (Number(r.custom_charges?.[k]) || 0), 0) * (r.fx_rate || 1);
    return sum + Number(r.total_usd || 0) + custom;
  }, 0);
  return {
    count: rows.length,
    total,
    paid: rows.filter((r: any) => r.paid_status === "PAID").length,
    pending: rows.filter((r: any) => !r.invoice_number).length,
  };
}

// "Paid · $3,740" / "Unpaid · $425" / "Pending" (no invoice entered yet) /
// "Not created" - never a bare amount, and never counts unpaid as paid.
function invoiceState(inv: InvoiceSummary): { text: string; tone: string } {
  if (inv.count === 0) return { text: "Not created", tone: "var(--mut)" };
  if (inv.pending === inv.count) return { text: "Pending", tone: "var(--warn)" };
  const amount = usd(inv.total);
  if (inv.paid === inv.count) return { text: `Paid · ${amount}`, tone: "var(--ok)" };
  const unpaid = inv.count - inv.paid;
  return { text: `${inv.count > 1 ? `${unpaid} of ${inv.count} unpaid` : "Unpaid"} · ${amount}`, tone: "var(--crit)" };
}

export default async function BookingDetail({ params }: { params: { id: string } }) {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const supabase = createServiceClient();
  // Scoped to the signed-in user's company - the service-role client
  // bypasses RLS, so without this any booking id would open.
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", params.id).eq("company_id", me.company_id).single();
  if (!booking) notFound();

  const bookingNumber = (booking.carrier_booking_no ?? "").trim();

  const [
    { data: legs },
    { data: trucking },
    { data: containers },
    { data: bookingParties },
    { data: amendments },
    { data: trackingRows },
    { data: fwdCustomCols },
    { data: truckerCustomCols },
  ] = await Promise.all([
    supabase.from("transport_legs").select("*").eq("booking_id", params.id).order("seq"),
    supabase.from("trucking_jobs").select("*, parties(legal_name)").eq("booking_id", params.id),
    supabase
      .from("containers")
      .select("id, container_no, seal_no, size_type, packing_items:container_packing_items(seal_no, weight, weight_unit, bales)")
      .eq("booking_id", params.id),
    supabase.from("booking_parties").select("role, party_id, parties(legal_name)").eq("booking_id", params.id),
    supabase.from("amendments").select("version, changed_fields, reason, created_at").eq("booking_id", params.id).order("version", { ascending: false }),
    supabase.from("tracking").select("id, release_status, invoice_sent, documents_sent, bl_status, invoice_no, party_id, created_at").eq("booking_id", params.id),
    supabase.from("forwarder_invoice_custom_columns").select("key").eq("company_id", booking.company_id),
    supabase.from("trucker_invoice_custom_columns").select("key").eq("company_id", booking.company_id),
  ]);

  const partyByRole: Record<string, { id: string; name: string }> = {};
  for (const bp of bookingParties ?? []) {
    if ((bp as any).parties) partyByRole[bp.role] = { id: bp.party_id, name: (bp as any).parties.legal_name };
  }

  const tracking = (trackingRows ?? [])[0] ?? null;
  const extraTrackingCount = Math.max(0, (trackingRows ?? []).length - 1);

  const emptyInv: InvoiceSummary = { count: 0, total: 0, paid: 0, pending: 0 };
  const [buyerInv, fwdInv, supplierInv, truckerInv] = bookingNumber
    ? await Promise.all([
        summarizeInvoices(supabase, "buyer_invoices", bookingNumber, booking.company_id),
        summarizeInvoices(supabase, "forwarder_invoices", bookingNumber, booking.company_id, (fwdCustomCols ?? []).map((c: any) => c.key)),
        summarizeInvoices(supabase, "supplier_invoices", bookingNumber, booking.company_id),
        summarizeInvoices(supabase, "trucker_invoices", bookingNumber, booking.company_id, (truckerCustomCols ?? []).map((c: any) => c.key)),
      ])
    : [emptyInv, emptyInv, emptyInv, emptyInv];

  const expenses = fwdInv.total + supplierInv.total + truckerInv.total;
  const estimatedMargin = buyerInv.total - expenses;
  // Only show a margin when it means something: a buyer invoice actually
  // entered, and no invoice on this booking still pending (blank). Anything
  // less would show a made-up profit or loss.
  const marginComplete =
    buyerInv.count > 0 &&
    buyerInv.pending === 0 &&
    [fwdInv, supplierInv, truckerInv].every((inv) => inv.pending === 0);

  const stage: "open" | "closed" | "cancelled" =
    booking.status === "cancelled" ? "cancelled" : booking.status === "delivered" ? "closed" : "open";

  const releaseStatus = tracking?.release_status ?? null;
  const stages: TimelineStage[] = [
    { label: "Booked", done: true, date: booking.created_at },
    { label: "Buyer Assigned", done: !!tracking?.party_id, date: tracking?.created_at },
    { label: "Instructions Sent", done: booking.instruction_status === "sent" },
    { label: "On Water", done: releaseStatus === "On Water" || releaseStatus === "Released" },
    { label: "Released", done: releaseStatus === "Released" },
  ];

  const firstContainerId: string | null = (containers ?? [])[0]?.id ?? null;

  // Click-to-edit detail field: EditableCell renders a <td>, so it gets a
  // one-cell table of its own inside this card's grid.
  const Field = ({ label, column, isDate = false }: { label: string; column: string; isDate?: boolean }) => (
    <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
      <div className="meta" style={{ marginBottom: 2 }}>{label}</div>
      <table className="tbl detail-field" style={{ margin: "0 -12px" }}><tbody><tr>
        <EditableCell bookingId={booking.id} column={column} value={(booking as any)[column]} isDate={isDate} />
      </tr></tbody></table>
    </div>
  );

  const route = booking.pol && booking.pod ? `${booking.pol} → ${booking.pod}` : booking.pol || booking.pod;
  const subtitle = [booking.carrier, route].filter(Boolean).join(" · ");

  const connected: { label: string; href: string; state: { text: string; tone: string } }[] = [
    {
      label: `Buyer Invoice${buyerInv.count > 1 ? `s (${buyerInv.count})` : ""}`,
      href: partyByRole.buyer ? `/parties/${partyByRole.buyer.id}/invoices` : "/parties",
      state: invoiceState(buyerInv),
    },
    {
      label: `Forwarder Invoice${fwdInv.count > 1 ? `s (${fwdInv.count})` : ""}`,
      href: partyByRole.forwarder ? `/forwarders/${partyByRole.forwarder.id}/invoices` : "/forwarders",
      state: invoiceState(fwdInv),
    },
    {
      label: `Supplier Invoice${supplierInv.count > 1 ? `s (${supplierInv.count})` : ""}`,
      href: partyByRole.supplier ? `/suppliers/${partyByRole.supplier.id}/invoices` : "/suppliers",
      state: invoiceState(supplierInv),
    },
    {
      label: `Trucker Invoice${truckerInv.count > 1 ? `s (${truckerInv.count})` : ""}`,
      href: partyByRole.trucker ? `/truckers/${partyByRole.trucker.id}/invoices` : "/truckers",
      state: invoiceState(truckerInv),
    },
  ];

  const cardStyle: React.CSSProperties = { padding: 20 };
  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid var(--line)", padding: "12px 0", fontSize: 13 };

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* Back to whichever section the booking sits in (lib/bookings-data.ts). */}
          {stage === "cancelled" ? (
            <BackButton href="/bookings/cancelled" label="Back to Cancelled Bookings" />
          ) : stage === "closed" ? (
            <BackButton href="/bookings/closed" label="Back to Closed Bookings" />
          ) : (
            <BackButton href="/bookings" label="Back to Booking & Instructions" />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--tx)" }}>
                {booking.carrier_booking_no || booking.booking_no}
              </h1>
              <StatusPill value={booking.status} />
            </div>
            {/* Shipping line and route - only the parts that are filled in. */}
            {subtitle && <p className="lbl" style={{ margin: "6px 0 0" }}>{subtitle}</p>}
          </div>
        </div>
        <BookingActions
          bookingId={booking.id}
          blNumber={booking.bl_number}
          containerNos={(containers ?? []).map((c: any) => c.container_no).filter(Boolean)}
          containerId={firstContainerId}
          instructionStatus={booking.instruction_status}
        />
      </div>

      <BookingStatusTimeline stages={stages} state={stage} />

      <div className="booking-detail-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <DatesCard
            bookingId={booking.id}
            version={booking.version ?? 1}
            values={{ erd: booking.erd, si_cutoff: booking.si_cutoff, cargo_cutoff: booking.cargo_cutoff, carrier: booking.carrier }}
            amendments={(amendments ?? []) as any}
            hasTrucking={!!partyByRole.trucker || (trucking ?? []).length > 0}
          />

          {legs && legs.length > 0 && (
            <section className="card" style={cardStyle}>
              <h2 className="h2">Routing</h2>
              <p className="lbl" style={{ margin: "4px 0 0" }}>Current voyage legs</p>
              <div className="tw" style={{ marginTop: 14 }}>
                <table className="tbl">
                  <thead>
                    <tr><th>#</th><th>From</th><th>To</th><th>Mode</th><th>Vessel / Voyage</th><th>ETD</th><th>ETA</th></tr>
                  </thead>
                  <tbody>
                    {legs.map((l: any) => (
                      <tr key={l.id}>
                        <td>{l.seq}</td><td>{l.from_location}</td><td>{l.to_location}</td>
                        <td>{l.transport_mode}</td><td>{l.vessel_voyage}</td>
                        <td>{l.etd ? new Date(l.etd).toLocaleDateString("en-GB") : "—"}</td>
                        <td>{l.eta ? new Date(l.eta).toLocaleDateString("en-GB") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card" style={cardStyle}>
            <h2 className="h2">Trucking</h2>
            {trucking && trucking.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                {trucking.map((t: any) => (
                  <div key={t.id} style={rowStyle}>
                    <b>{t.parties?.legal_name ?? "Trucker"}</b>
                    <span className="lbl">pickup {t.pickup_at ? new Date(t.pickup_at).toLocaleString("en-GB") : "not scheduled"} · {t.status}</span>
                  </div>
                ))}
              </div>
            ) : partyByRole.trucker ? (
              <p className="lbl" style={{ margin: "10px 0 0" }}>
                <b style={{ color: "var(--tx)" }}>{partyByRole.trucker.name}</b> is assigned - pickup not scheduled yet.
              </p>
            ) : (
              <p className="lbl" style={{ margin: "10px 0 0" }}>
                No trucking assigned yet. Assign a trucker in Booking &amp; Instructions to activate pickup tracking and cut-off checks.
              </p>
            )}
          </section>

          <section className="card" style={cardStyle}>
            <h2 className="h2">Shipment &amp; Routing Details</h2>
            <p className="lbl" style={{ margin: "4px 0 14px" }}>Click any field to fill in or correct it, without leaving the booking.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px 18px" }}>
              <Field label="Port of Delivery" column="final_destination" />
              <Field label="B/L Issued At" column="bl_issued_at" />
              <Field label="Forwarder Name" column="forwarder_name" />
              <Field label="Size of Container" column="container_size" />
              <Field label="Commodity" column="commodity" />
              <Field label="HS Code" column="hs_code" />
              <Field label="Gross Weight" column="gross_weight" />
              <Field label="Incoterm" column="incoterm" />
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card" style={cardStyle}>
            <h2 className="h2">Connected Records</h2>
            <p className="lbl" style={{ margin: "4px 0 10px" }}>Everything that shares this booking number</p>
            <div style={rowStyle}>
              <Link href="/tracking" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
                Shipment Tracking{extraTrackingCount > 0 ? ` (+${extraTrackingCount})` : ""}
              </Link>
              {tracking ? <StatusPill value={releaseStatus ?? "— set —"} /> : <span className="lbl">Not tracked yet</span>}
            </div>
            {connected.map((c) => (
              <div key={c.label} style={rowStyle}>
                <Link href={c.href} style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>{c.label}</Link>
                <span style={{ color: c.state.tone, fontWeight: 500, textAlign: "right" }}>{c.state.text}</span>
              </div>
            ))}
          </section>

          <section className="card" style={cardStyle}>
            <h2 className="h2">Parties</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px", marginTop: 8 }}>
              {(["supplier", "buyer", "forwarder", "trucker"] as const).map((role) => (
                <div key={role} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
                  <div className="meta" style={{ textTransform: "capitalize", marginBottom: 4 }}>{role}</div>
                  {partyByRole[role] ? (
                    <b style={{ fontSize: 13 }}>{partyByRole[role].name}</b>
                  ) : (
                    <span className="lbl">Not assigned</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={cardStyle}>
            <h2 className="h2">Estimated Margin</h2>
            <p className="lbl" style={{ margin: "4px 0 0" }}>Buyer invoice minus forwarder, supplier and trucker expenses</p>
            {marginComplete ? (
              <>
                <div style={{ fontSize: 27, fontWeight: 800, margin: "12px 0 3px", color: estimatedMargin >= 0 ? "var(--ok)" : "var(--crit)" }}>
                  {usd(estimatedMargin)}
                </div>
                <p className="lbl" style={{ margin: 0 }}>{usd(buyerInv.total)} buyer − {usd(expenses)} expenses</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 27, fontWeight: 800, margin: "12px 0 3px", color: "var(--mut)" }}>—</div>
                <p className="lbl" style={{ margin: 0 }}>
                  Waiting for complete financial data
                  {buyerInv.count === 0 ? " - no buyer invoice yet" : " - some invoices are still pending"}
                </p>
              </>
            )}
          </section>

          <section className="card" style={cardStyle}>
            <h2 className="h2">Containers ({(containers ?? []).length})</h2>
            {(containers ?? []).length === 0 ? (
              <p className="lbl" style={{ margin: "10px 0 0" }}>No containers on this booking yet.</p>
            ) : (
              <div style={{ marginTop: 10 }}>
                {(containers ?? []).map((c: any) => {
                  const item = (c.packing_items ?? [])[0];
                  return (
                    <div key={c.id} style={{ ...rowStyle, display: "block" }}>
                      <b className="mono">{c.container_no || "— not set —"}</b>
                      <div className="lbl" style={{ marginTop: 3 }}>
                        {item ? `Seal ${item.seal_no ?? "—"} · ${item.bales ?? "—"} bales · ${item.weight ?? "—"} ${item.weight_unit ?? ""}` : "No packing details yet"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
