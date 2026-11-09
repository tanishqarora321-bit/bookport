"use client";

import { useState } from "react";
import StatusMenuButton, { StatusOption } from "@/components/ui/StatusMenuButton";

// Same floating pill menu as the ledgers' Paid / Status (live) columns. Must
// match the bookings.status check constraint (migration 0001); `delivered`
// reads "Closed" (lib/bookings-data.ts CLOSED_STATUS). Picking Closed or
// Cancelled moves the booking to that section - the grid handles that in
// onChanged.
const STATUS_OPTIONS: StatusOption[] = [
  { value: "draft", label: "Draft", badgeClass: "b-neu" },
  { value: "confirmed", label: "Confirmed", badgeClass: "b-info" },
  { value: "in_transit", label: "In Transit", badgeClass: "b-warn" },
  { value: "delivered", label: "Closed", badgeClass: "b-ok" },
  { value: "cancelled", label: "Cancelled", badgeClass: "b-crit" },
];

export default function StatusCell({
  bookingId, value, onChanged
}: { bookingId: string; value: string; onChanged: (value: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function save(next: string) {
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body, fall through to status */ }
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      onChanged(next);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <td style={{ minWidth: 150 }}>
      <StatusMenuButton value={value} options={STATUS_OPTIONS} ariaLabel="Booking status" onChange={save} />
      {error && <div className="err" style={{ marginTop: 4 }}>{error}</div>}
    </td>
  );
}
