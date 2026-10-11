"use client";

import { useState } from "react";

export type BuyerGstEntry = {
  id: string;
  buyer_party_id: string;
  legal_name: string;
  gst_no: string | null;
  iec_code: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  description_of_goods: string | null;
  hs_code: string | null;
  sort_order: number;
};

// Separate dropdown from the Buyer picker on purpose (per Tanishq: "keep
// the party name" in Buyer, pick the exact legal entity here) - a buyer
// group like "MANAN SINGLA" ships under several GST entities, and the
// real BL has to name one specific one. Options are just this row's
// buyer's own GST entries, picked explicitly per booking since there's
// no reliable way to auto-infer which entity a given shipment is under.
export default function ConsigneeAsPerBlCell({
  bookingId,
  buyerId,
  value,
  entries,
  onChanged,
}: {
  bookingId: string;
  buyerId: string | null;
  value: string | null;
  entries: BuyerGstEntry[];
  onChanged: (value: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = buyerId ? entries.filter((e) => e.buyer_party_id === buyerId) : [];

  async function handleChange(next: string) {
    const nextId = next || null;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignee_gst_entry_id: nextId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      onChanged(nextId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!buyerId) {
    return <td className="px-3 py-2 text-sm whitespace-nowrap text-ink/30">—</td>;
  }

  return (
    <td className="px-3 py-2 min-w-[160px]">
      <select
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="text-sm px-2 py-1 rounded border border-slate-200 bg-white w-full"
      >
        <option value="">— Select GST entity —</option>
        {options.map((e) => (
          <option key={e.id} value={e.id}>
            {e.legal_name}
          </option>
        ))}
      </select>
      {options.length === 0 && <div className="text-[11px] text-ink/40 mt-0.5">No GST entries for this buyer</div>}
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </td>
  );
}
