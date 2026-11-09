import { redirect } from "next/navigation";

// Multiple Bookings & Instructions no longer has its own page - those rows
// are highlighted in Booking & Instructions, with a "Multiple only" filter.
// Kept as a redirect so old links and bookmarks still land somewhere useful.
export default function MultipleBookingsPage() {
  redirect("/bookings?multiple=1");
}
