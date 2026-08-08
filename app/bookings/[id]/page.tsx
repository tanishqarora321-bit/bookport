import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import AmendableField from "./AmendableField";
import EditableCell from "@/components/EditableCell";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// TEMPORARY: service-role client, no login screen built yet - see README.
export default async function BookingDetail({ params }: { params: { id: string } }) {
  const supabase = createServiceClient();
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", params.id).single();
  if (!booking) notFound();

  const { data: legs } = await supabase
    .from("transport_legs")
    .select("*")
    .eq("booking_id", params.id)
    .order("seq");

  const { data: trucking } = await supabase
    .from("trucking_jobs")
    .select("*, parties(legal_name)")
    .eq("booking_id", params.id);

  // A plain <td>-style cell doesn't fit this page's layout, so this small
  // wrapper reuses EditableCell's click-to-edit behavior inline in a div.
  const Field = ({ label, column, isDate = false }: { label: string; column: string; isDate?: boolean }) => (
    <div>
      <span className="text-slate-400 text-xs">{label}</span>
      <table className="w-full -mt-1"><tbody><tr>
        <EditableCell bookingId={booking.id} column={column} value={(booking as any)[column]} isDate={isDate} />
      </tr></tbody></table>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/bookings" className="text-slate-400 hover:text-slate-700 text-lg leading-none" title="Back to Bookings">
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{booking.carrier_booking_no || booking.booking_no}</h1>
          <p className="text-slate-500">{booking.carrier} · {booking.pol} → {booking.pod}</p>
        </div>
      </div>

      <section className="bg-white rounded shadow-sm p-5 space-y-3">
        <h2 className="font-medium text-slate-700">Dates & Cut-offs</h2>
        <p className="text-xs text-slate-400 -mt-2">
          Editing any of these opens an amendment - it checks what breaks (trucking, SI status) before saving.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <AmendableField bookingId={booking.id} field="erd" label="ERD" value={booking.erd} version={booking.version} />
          <AmendableField bookingId={booking.id} field="si_cutoff" label="DOC Cut Off" value={booking.si_cutoff} version={booking.version} />
          <AmendableField bookingId={booking.id} field="cargo_cutoff" label="Cargo Cut Off" value={booking.cargo_cutoff} version={booking.version} />
          <AmendableField bookingId={booking.id} field="carrier" label="Shipping Line" value={booking.carrier} version={booking.version} />
        </div>
      </section>

      {legs && legs.length > 0 && (
        <section className="bg-white rounded shadow-sm p-5">
          <h2 className="font-medium text-slate-700 mb-2">Routing</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr><th>#</th><th>From</th><th>To</th><th>Mode</th><th>Vessel/Voyage</th><th>ETD</th><th>ETA</th></tr>
            </thead>
            <tbody>
              {legs.map((l: any) => (
                <tr key={l.id} className="border-t">
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

      <section className="bg-white rounded shadow-sm p-5">
        <h2 className="font-medium text-slate-700 mb-2">Trucking</h2>
        {trucking && trucking.length > 0 ? (
          trucking.map((t: any) => (
            <div key={t.id} className="text-sm border-t pt-2">
              {t.parties?.legal_name} · pickup {t.pickup_at ? new Date(t.pickup_at).toLocaleString("en-GB") : "unscheduled"} · {t.status}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">
            No trucking assigned yet — this comes online with the Truckers module.
          </p>
        )}
      </section>

      <section className="bg-white rounded shadow-sm p-5">
        <h2 className="font-medium text-slate-700 mb-3">Shipment & Routing Details</h2>
        <p className="text-xs text-slate-400 -mt-2 mb-3">Click any field below to fill in or correct it.</p>
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
  );
}
