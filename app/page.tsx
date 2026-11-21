import LandingClient from "@/components/LandingClient";

// "/" is the public landing page for signed-out visitors; signed-in users are
// redirected to /bookings by middleware.ts before this renders.
export const metadata = {
  title: "Ship-Sphere — One Booking. All Connected.",
  description: "Ship-Sphere brings freight bookings, shipment tracking, documents and financial workflows into one connected workspace.",
};

export default function Home() {
  return <LandingClient />;
}
