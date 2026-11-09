"use client";

import { useRouter } from "next/navigation";
import UploadBlCell from "@/components/UploadBlCell";
import SendInstructionsCell from "@/components/SendInstructionsCell";

// Thin client wrapper so the (server component) booking detail page can
// drop these two buttons into its header - a Server Component can't pass
// an inline onApplied/onSent function prop directly to a "use client"
// component, since functions can't cross that serialization boundary.
export default function BookingActions({
  bookingId,
  blNumber,
  containerId,
  containerNos = [],
  instructionStatus,
}: {
  bookingId: string;
  blNumber: string | null;
  containerId: string | null;
  containerNos?: string[];
  instructionStatus: string | null;
}) {
  const router = useRouter();
  // Both cells render a <td> as their root (built for use inside the
  // Booking & Instructions grid), so they need an actual table ancestor
  // here too, not a <div> - keeping the pair side by side needs one row.
  return (
    <table style={{ maxWidth: "100%" }}>
      <tbody>
        {/* Wraps onto a second line on narrow screens instead of running off the edge. */}
        <tr style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <UploadBlCell bookingId={bookingId} blNumber={blNumber} containerNos={containerNos} onApplied={() => router.refresh()} size="lg" />
          <SendInstructionsCell
            bookingId={bookingId}
            containerId={containerId}
            instructionStatus={instructionStatus}
            onSent={() => router.refresh()}
            size="lg"
          />
        </tr>
      </tbody>
    </table>
  );
}
