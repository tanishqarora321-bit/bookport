// Shipment Tracking is the master for a container's ETA and Release Status
// (owner rule, 2026-11). Every party ledger (Forwarders, Truckers, Suppliers,
// Buyers) shows them live from the tracking row, read-only. An invoice import
// may still bring them in, but only to fill a value Shipment Tracking doesn't
// have yet: once a value is there, it changes only in Shipment Tracking.
//
// Returns the updates actually written ({} when the tracking row already had
// both values), or an error message.
export async function fillTrackingBlanks(
  supabase: any,
  trackingId: string,
  updates: { eta?: string | null; release_status?: string | null }
): Promise<{ applied: Record<string, any>; error: string | null }> {
  if (!updates.eta && !updates.release_status) return { applied: {}, error: null };
  const { data: current, error: readError } = await supabase
    .from("tracking")
    .select("eta, release_status")
    .eq("id", trackingId)
    .maybeSingle();
  if (readError) return { applied: {}, error: readError.message };
  if (!current) return { applied: {}, error: null };

  const applied: Record<string, any> = {};
  if (updates.eta && !current.eta) {
    applied.eta = updates.eta;
    // "Last Checked" = when the ETA was last updated.
    applied.last_tracking_check_at = new Date().toISOString();
  }
  if (updates.release_status && !current.release_status) applied.release_status = updates.release_status;
  if (Object.keys(applied).length === 0) return { applied, error: null };

  const { error } = await supabase.from("tracking").update(applied).eq("id", trackingId);
  return { applied: error ? {} : applied, error: error ? error.message : null };
}
