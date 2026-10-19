import { getCurrentProfile } from "@/lib/supabase/session";
import SignInRequired from "@/components/SignInRequired";
import ProfitLossClient from "@/components/ProfitLossClient";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ProfitLossPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  return <ProfitLossClient />;
}
