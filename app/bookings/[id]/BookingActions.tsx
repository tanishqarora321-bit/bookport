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
  instructionStatus,
}: {
  bookingId: string;
  blNumber: string | null;
  containerId: string | null;
  instructionStatus: string | null;
}) {
  const router = useRouter();
  // Both cells render a <td> as their root (built for use inside the
  // Booking & Instructions grid), so they need an actual table ancestor
  // here too, not a <div> - keeping the pair side by side needs one row.
  return (
    <table>
      <tbody>
        <tr>
          <UploadBlCell bookingId={bookingId} blNumber={blNumber} onApplied={() => router.refresh()} />
          <SendInstructionsCell
            bookingId={bookingId}
            containerId={containerId}
            instructionStatus={instructionStatus}
            onSent={() => router.refresh()}
          />
        </tr>
      </tbody>
    </table>
  );
}
