// TEMPORARY: no login screen yet, so every service-role query/write needs
// an explicit company_id (the DB now requires one - see migration 0003).
// Once auth lands, this gets replaced by the logged-in user's company_id
// from their session/profile instead of a hardcoded constant.
//
// This MUST match the default company id inserted by migration 0003.
export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
