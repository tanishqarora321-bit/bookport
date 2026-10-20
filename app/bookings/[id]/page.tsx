import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import AmendableField from "./AmendableField";
import BookingActions from "./BookingActions";
import EditableCell from "@/components/EditableCell";
import StatusPill from "@/components/ui/StatusPill";
import BookingStatusTimeline, { type TimelineStage } from "@/components/BookingStatusTimeline";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// booking_number on the four invoice tables is a plain copied text column,
// not a foreign key (see lib/profit-loss.ts) - matched case-insensitively
// here for the same reason that file normalizes it.
async function sumInvoices(supabase: any, table: string, idCol: string, bookingNumber: string, customKeys: string[] = []) {
  const { data } = await supabase.from(table).select(`id, total_usd${customKeys.length ? ", custom_charges, fx_rate" : ""}`).ilike("booking_number", bookingNumber);
  const rows = data ?? [];
  const total = rows.reduce((sum: number, r: any) => {
    const custom = customKeys.reduce((s, k) => s + (Number(r.custom_charges?.[k]) || 0), 0) * (r.fx_rate || 1);
    return sum + Number(r.total_usd || 0) + custom;
  }, 0);
  return { count: rows.length, total };
}

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function BookingDetail({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", params.id).single();
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

  const [buyerInv, fwdInv, supplierInv, truckerInv] = bookingNumber
    ? await Promise.all([
        sumInvoices(supabase, "buyer_invoices", "buyer_id", bookingNumber),
        sumInvoices(supabase, "forwarder_invoices", "forwarder_id", bookingNumber, (fwdCustomCols ?? []).map((c: any) => c.key)),
        sumInvoices(supabase, "supplier_invoices", "supplier_id", bookingNumber),
        sumInvoices(supabase, "trucker_invoices", "trucker_id", bookingNumber, (truckerCustomCols ?? []).map((c: any) => c.key)),
      ])
    : [{ count: 0, total: 0 }, { count: 0, total: 0 }, { count: 0, total: 0 }, { count: 0, total: 0 }];

  const expenses = fwdInv.total + supplierInv.total + truckerInv.total;
  const estimatedMargin = buyerInv.total - expenses;

  const releaseStatus = tracking?.release_status ?? null;
  const stages: TimelineStage[] = [
    { label: "Booked", done: true, date: booking.created_at },
    { label: "Buyer Assigned", done: !!tracking?.party_id, date: tracking?.created_at },
    { label: "Instructions Sent", done: booking.instruction_status === "sent" },
    { label: "On Water", done: releaseStatus === "On Water" || releaseStatus === "Released" },
    { label: "Released", done: releaseStatus === "Released" },
  ];

  const firstContainerId: string | null = (containers ?? [])[0]?.id ?? null;

  // A plain <td>-style cell doesn't fit this page's layout, so this small
  // wrapper reuses EditableCell's click-to-edit behavior inline in a div.
  const Field = ({ label, column, isDate = false }: { label: string; column: string; isDate?: boolean }) => (
    <div>
      <span className="text-muted text-xs">{label}</span>
      <table className="w-full -mt-1"><tbody><tr>
        <EditableCell bookingId={booking.id} column={column} value={(booking as any)[column]} isDate={isDate} />
      </tr></tbody></table>
    </div>
  );

  function changeSummary(changed: Record<string, { old: any; new: any }>) {
    const [field, { old: oldVal, new: newVal }] = Object.entries(changed)[0] as [string, { old: any; new: any }];
    const label = field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return `${label} ${oldVal ?? "—"} → ${newVal ?? "—"}`;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/bookings" className="text-muted hover:text-ink text-lg leading-none" title="Back to Bookings">
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-ink">{booking.carrier_booking_no || booking.booking_no}</h1>
              <StatusPill value={booking.status} />
            </div>
            <p className="text-text-2 text-sm">{booking.carrier} · {booking.pol} → {booking.pod}</p>
          </div>
        </div>
        <BookingActions
          bookingId={booking.id}
          blNumber={booking.bl_number}
          containerId={firstContainerId}
          instructionStatus={booking.instruction_status}
        />
      </div>

      <BookingStatusTimeline stages={stages} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <section className="bg-surface border border-line rounded-xl p-5 space-y-3">
            <h2 className="font-medium text-ink">Dates & Cut-offs</h2>
            <p className="text-xs text-muted -mt-2">
              Editing any of these opens an amendment - it checks what breaks (trucking, SI status) before saving.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <AmendableField bookingId={booking.id} field="erd" label="ERD" value={booking.erd} version={booking.version} />
              <AmendableField bookingId={booking.id} field="si_cutoff" label="DOC Cut Off" value={booking.si_cutoff} version={booking.version} />
              <AmendableField bookingId={booking.id} field="cargo_cutoff" label="Cargo Cut Off" value={booking.cargo_cutoff} version={booking.version} />
              <AmendableField bookingId={booking.id} field="carrier" label="Shipping Line" value={booking.carrier} version={booking.version} />
            </div>

            {amendments && amendments.length > 0 && (
              <div className="pt-3 border-t border-line">
                <div className="text-[10px] uppercase tracking-wide text-muted mb-2">Amendment History</div>
                <div className="space-y-2">
                  {amendments.map((a: any) => (
                    <div key={a.version} className="text-xs">
                      <span className="font-medium text-ink">v{a.version}</span>{" "}
                      <span className="text-text-2">{changeSummary(a.changed_fields)}</span>
                      <div className="text-muted">
                        {new Date(a.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {a.reason ? ` · "${a.reason}"` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {legs && legs.length > 0 && (
            <section className="bg-surface border border-line rounded-xl p-5">
              <h2 className="font-medium text-ink mb-2">Routing</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr><th>#</th><th>From</th><th>To</th><th>Mode</th><th>Vessel/Voyage</th><th>ETD</th><th>ETA</th></tr>
                </thead>
                <tbody>
                  {legs.map((l: any) => (
                    <tr key={l.id} className="border-t border-line">
                      <td>{l.seq}</td><td>{l.from_location}</td><td>{l.to_location}</td>
                      <td>{l.transport_mode}</td><td>{l.vessel_voyage}</td>
                      <td>{l.etd ? new Date(l.etd).toLocaleDateString("en-GB") : "—"}</td>
                      <td>{l.eta ? new Date(l.eta).toLocaleDateString("en-GB") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-medium text-ink mb-2">Trucking</h2>
            {trucking && trucking.length > 0 ? (
              trucking.map((t: any) => (
                <div key={t.id} className="text-sm border-t border-line pt-2">
                  {t.parties?.legal_name} · pickup {t.pickup_at ? new Date(t.pickup_at).toLocaleString("en-GB") : "unscheduled"} · {t.status}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                No trucking assigned yet — this comes online with the Truckers module.
              </p>
            )}
          </section>

          <section className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-medium text-ink mb-3">Shipment & Routing Details</h2>
            <p className="text-xs text-muted -mt-2 mb-3">Click any field below to fill in or correct it.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Port of Delivery" column="final_destination" />
              <Field label="B/L Issued At" column="bl_issued_at" />
              <Field label="Forwarder Name" column="forwarder_name" />
              <Field label="Size Of Container" column="container_size" />
              <Field label="Commodity" column="commodity" />
              <Field label="HS Code" column="hs_code" />
              <Field label="Gross Weight" column="gross_weight" />
              <Field label="Incoterm" column="incoterm" />
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-medium text-ink mb-1">Connected Records</h2>
            <p className="text-xs text-muted mb-3">Everything that shares this booking number</p>
            <div className="space-y-3 text-sm">
              <Link href="/tracking" className="flex items-center justify-between hover:text-accent">
                <span>Shipment Tracking{extraTrackingCount > 0 ? ` (+${extraTrackingCount})` : ""}</span>
                <StatusPill value={tracking ? releaseStatus ?? "— set —" : null} />
              </Link>
              <Link href={partyByRole.buyer ? `/parties/${partyByRole.buyer.id}/invoices` : "/parties"} className="flex items-center justify-between hover:text-accent">
                <span>Buyer Invoice{buyerInv.count > 1 ? `s (${buyerInv.count})` : ""}</span>
                <span className="text-text-2">{buyerInv.count > 0 ? usd(buyerInv.total) : "—"}</span>
              </Link>
              <Link href={partyByRole.forwarder ? `/forwarders/${partyByRole.forwarder.id}/invoices` : "/forwarders"} className="flex items-center justify-between hover:text-accent">
                <span>Forwarder Invoice{fwdInv.count > 1 ? `s (${fwdInv.count})` : ""}</span>
                <span className="text-text-2">{fwdInv.count > 0 ? usd(fwdInv.total) : "—"}</span>
              </Link>
              <Link href={partyByRole.supplier ? `/suppliers/${partyByRole.supplier.id}/invoices` : "/suppliers"} className="flex items-center justify-between hover:text-accent">
                <span>Supplier Invoice{supplierInv.count > 1 ? `s (${supplierInv.count})` : ""}</span>
                <span className="text-text-2">{supplierInv.count > 0 ? usd(supplierInv.total) : "—"}</span>
              </Link>
              <Link href={partyByRole.trucker ? `/truckers/${partyByRole.trucker.id}/invoices` : "/truckers"} className="flex items-center justify-between hover:text-accent">
                <span>Trucker Invoice{truckerInv.count > 1 ? `s (${truckerInv.count})` : ""}</span>
                <span className="text-text-2">{truckerInv.count > 0 ? usd(truckerInv.total) : "—"}</span>
              </Link>
            </div>
          </section>

          <section className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-medium text-ink mb-3">Parties</h2>
            <div className="space-y-3">
              {(["supplier", "buyer", "forwarder", "trucker"] as const).map((role) => (
                <div key={role} className="text-sm">
                  <div className="text-xs text-muted capitalize">{role}</div>
                  {partyByRole[role] ? (
                    <div className="text-ink font-medium">{partyByRole[role].name}</div>
                  ) : (
                    <div className="text-muted">— not assigned —</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface border border-line rounded-xl p-5">
            <h2 className="font-medium text-ink mb-1">Estimated Margin</h2>
            <p className="text-xs text-muted mb-3">Buyer invoice total minus Forwarder + Supplier + Trucker</p>
            <div className={`text-2xl font-semibold ${estimatedMargin >= 0 ? "text-success" : "text-critical"}`}>
              {usd(estimatedMargin)}
            </div>
            <div className="text-xs text-muted mt-1">
              {usd(buyerInv.total)} buyer − {usd(expenses)} expenses
            </div>
          </section>

          {containers && containers.length > 0 && (
            <section className="bg-surface border border-line rounded-xl p-5">
              <h2 className="font-medium text-ink mb-3">Containers ({containers.length})</h2>
              <div className="space-y-2">
                {containers.map((c: any) => {
                  const item = (c.packing_items ?? [])[0];
                  return (
                    <div key={c.id} className="text-sm border-t border-line pt-2 first:border-t-0 first:pt-0">
                      <div className="font-medium text-ink">{c.container_no || "— not set —"}</div>
                      <div className="text-xs text-muted">
                        {item ? `Seal ${item.seal_no ?? "—"} · ${item.bales ?? "—"} bales · ${item.weight ?? "—"} ${item.weight_unit ?? ""}` : "No packing details yet"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
