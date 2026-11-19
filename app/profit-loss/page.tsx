import { getCurrentProfile } from "@/lib/supabase/session";
import { createServiceClient } from "@/lib/supabase/server";
import SignInRequired from "@/components/SignInRequired";
import PnlClient from "@/components/PnlClient";
import { buildPnlRows } from "@/lib/pnl-report";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Profit & Loss (owner, 2026-11): Elaborate (every party, invoice and
// amount per container) and Consolidated (cost vs sell per container) -
// lib/pnl-report.ts.
export default async function ProfitLossPage() {
  const me = await getCurrentProfile();
  if (!me) return <SignInRequired />;
  const { rows, ready } = await buildPnlRows(createServiceClient(), me.company_id);
  return <PnlClient initialRows={rows} ready={ready} />;
}
