import { renderBookingsPage } from "@/lib/bookings-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ClosedBookingsPage() {
  return renderBookingsPage("closed");
}
