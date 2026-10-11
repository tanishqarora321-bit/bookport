"use client";

import { useState } from "react";

// Left of Instruction Status per Tanishq's spec (image 3): one click
// renders the booking-instruction letter PDF from the booking/container/
// consignee-GST-entry data already on this row and opens it - same
// generate-then-open flow as the Final Invoice button in Tracking.
export default function GenerateInstructionsCell({
  bookingId,
  containerId,
}: {
  bookingId: string;
  containerId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container_id: containerId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate");
      if (json.url) window.open(json.url, "_blank");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <button
        onClick={generate}
        disabled={loading}
        className="text-xs border border-accent text-accent px-2 py-1 rounded hover:bg-accent hover:text-white disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate Instructions"}
      </button>
      {error && <div className="text-xs text-cutoff mt-1 max-w-[160px]">{error}</div>}
    </td>
  );
}
