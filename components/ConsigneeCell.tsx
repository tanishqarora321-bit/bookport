"use client";

import { useState } from "react";
import PartyPickerCell from "@/components/PartyPickerCell";

type PartyOption = { id: string; legal_name: string };
type ConsigneeItem = { id: string; description: string; sort_order: number };

// Buyer/Consignee column: the party picker (same widget as
// Forwarder/Trucker/Supplier) PLUS a description-lines popover -- Tanishq's
// note that this needs multiple description entries (a "+" to add more),
// for use later when generating invoices from a booking.
export default function ConsigneeCell({
  bookingId,
  current,
  options,
  items,
  onAssigned,
  onCreated,
  onItemsChange,
}: {
  bookingId: string;
  current: { id: string; name: string } | null;
  options: PartyOption[];
  items: ConsigneeItem[];
  onAssigned: (party: { id: string; name: string } | null) => void;
  onCreated: (party: PartyOption) => void;
  onItemsChange: (items: ConsigneeItem[]) => void;
}) {
  const [showItems, setShowItems] = useState(false);

  return (
    <>
      <PartyPickerCell
        bookingId={bookingId}
        role="buyer"
        roleLabel="Buyer"
        createEndpoint="/api/parties"
        responseKey="party"
        current={current}
        options={options}
        onAssigned={onAssigned}
        onCreated={onCreated}
      />
      <td className="px-3 py-2 whitespace-nowrap relative">
        <button onClick={() => setShowItems(!showItems)} className="text-xs text-accent underline">
          {items.length > 0 ? `${items.length} description${items.length > 1 ? "s" : ""}` : "+ Description"}
        </button>
        {showItems && (
          <DescriptionPopover
            bookingId={bookingId}
            items={items}
            onClose={() => setShowItems(false)}
            onItemsChange={onItemsChange}
          />
        )}
      </td>
    </>
  );
}

function DescriptionPopover({
  bookingId,
  items,
  onClose,
  onItemsChange,
}: {
  bookingId: string;
  items: ConsigneeItem[];
  onClose: () => void;
  onItemsChange: (items: ConsigneeItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addItem() {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/consignee-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draft.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add");
      onItemsChange([...items, json.item]);
      setDraft("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/bookings/${bookingId}/consignee-items/${itemId}`, { method: "DELETE" });
    if (res.ok) onItemsChange(items.filter((i) => i.id !== itemId));
  }

  return (
    <div className="absolute z-30 mt-1 w-72 bg-white border rounded-lg shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-ink/60">Descriptions (for invoicing)</span>
        <button onClick={onClose} title="Close" className="text-ink/40 hover:text-ink text-sm">
          ✕
        </button>
      </div>
      <ul className="space-y-1 mb-2 max-h-40 overflow-auto">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-2 py-1">
            <span className="truncate">{it.description}</span>
            <button onClick={() => removeItem(it.id)} className="text-cutoff text-xs shrink-0 ml-2">
              ✕
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-ink/40">No descriptions yet.</li>}
      </ul>
      <div className="flex gap-1">
        <input
          autoFocus
          placeholder="Add a description line"
          className="border rounded px-2 py-1 text-sm flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          disabled={saving}
        />
        <button onClick={addItem} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded shrink-0">
          +
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </div>
  );
}
