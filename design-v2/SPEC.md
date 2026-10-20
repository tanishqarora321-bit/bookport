# Ship-Sphere v2 — shared build spec (every artboard MUST follow this)

Root folder: /tmp/claude-0/-home-claude/26ea0fd8-1aa6-55fb-a0f7-c7f309cb25b3/scratchpad/ss
Write each artboard with the Write tool to <root>/project/<Name>.dc.html. Do NOT publish, do NOT touch canvas.json, do NOT verify/render.
Format rules: the Design type skill text + format.md already in context (close every tag, quote attributes, `{{hole}}` = dotted lookup only, compute in renderVals, `<sc-for>`/`<sc-if>` with hint-* attrs, events `onClick="{{fn}}"`, no innerHTML, icons = inline stroke SVG with aria-hidden, never emoji, real <button>/<a>/<input>/<label>/<select>, aria-label on icon-only buttons).

## Product facts
- Use EXACT labels from the UI inventory report earlier in this conversation (subagent report). Keep every existing column, filter, option, modal field and message. No new major features.
- Removed from nav (placeholders the owner is deleting): "Invoices & Statement", "Dashboard & Reports". The app home is Booking & Instructions.
- Fix: the grid column labelled "Vessel" actually stores container size -> label it "Container Size".
- Sample data: realistic freight data, e.g. booking numbers 401610299853, 400600270642, NAM8534819, HL-11952005, EX471632, 274502536; carriers Maersk, Hapag-Lloyd, MSC, CMA CGM, ONE, Evergreen, HMM; ports Seattle, Savannah, Antwerp, Hamburg, Rotterdam, Los Angeles, Mundra IN, Nhava Sheva; buyers Jagmohan (short code JM), Kuldeep (KD), LR Traders (LR); forwarders UAL, Walker; truckers/suppliers as "[Supplier name]" style placeholders where unknown; invoice numbers like 2026-LR/09, 2026-JM/03. Containers like MSKU 552019-3. Year 2026, today Mon 19 Oct 2026.

## Shell (every app page)
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ship-Sphere — PAGE</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&amp;family=Geist+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
/*TOKENS — paste the whole TOKENS block below verbatim*/
</style>
</helmet>
<div class="{{themeClass}}" style="position: relative; min-height: Hpx; display: flex; flex-wrap: wrap; background: var(--bg); color: var(--tx); font-family: 'Geist', system-ui, sans-serif; font-size: 14px">
  <div style="flex: 1 1 256px; display: flex">
    <dc-import name="V2Nav" active="KEY" hint-size="256px,1000px"></dc-import>
  </div>
  <div style="flex: 999 1 640px; min-width: 0; display: flex; flex-direction: column">
    <header style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 28px; min-height: 56px; background: var(--surf); border-bottom: 1px solid var(--line)">
      <nav aria-label="Breadcrumb" class="lbl" style="flex: 1 1 auto">SECTION <span aria-hidden="true">›</span> <span style="color: var(--tx); font-weight: 600">PAGE</span></nav>
      <div class="seg" role="radiogroup" aria-label="Appearance">
        <sc-for list="{{themes}}" as="t" hint-placeholder-count="3">
          <button role="radio" aria-checked="{{t.checked}}" class="{{t.cls}}" onClick="{{t.pick}}">{{t.label}}</button>
        </sc-for>
      </div>
    </header>
    <main style="padding: 24px 28px 48px; display: flex; flex-direction: column; gap: 20px; min-width: 0">
      ...page...
    </main>
  </div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"theme":{"editor":"enum","options":["light","dark","system"],"default":"light"},"$preview":{"width":1440,"height":H}}'>
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { theme: null }; }
  renderVals() {
    const theme = this.state.theme ?? this.props.theme ?? 'light';
    const themes = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(([id, label]) => ({ label, cls: theme === id ? 'on' : '', checked: theme === id ? 'true' : 'false', pick: () => this.setState({ theme: id }) }));
    return { themeClass: 'th-' + theme, themes };
  }
}
</script>
</body>
</html>
```
V2Nav `active` keys: bookings, multiple, tracking, buyers, forwarders, suppliers, truckers, freight, offers, pl, settings, admin.
Breadcrumb SECTION values: Operations (bookings, multiple, tracking), Partners (buyers, forwarders, suppliers, truckers), Commercial (freight, offers), Finance (pl), Admin (settings, admin).
Modal artboards: keep the shell, render a muted page behind, then a `<div class="scrim">` (position absolute, inset 0) holding the `.modal`. Do not use `position: fixed`.
Use class holes for state-driven styling: `class="badge {{r.b}}"`, `class="tab {{t.cls}}"`, `class="chip {{c.cls}}"`.

## TOKENS block (verbatim)
```css
body{margin:0}
*{box-sizing:border-box}
.th-light,.th-system{color-scheme:light;--bg:#F5F7FB;--surf:#FFFFFF;--surf2:#F8FAFC;--elev:#FFFFFF;--tx:#0F172A;--tx2:#475569;--mut:#64748B;--line:#E2E8F0;--line2:#CBD5E1;--accent:#2F5FE0;--accentH:#2449B8;--onAccent:#FFFFFF;--accentS:#EAF0FD;--ok:#047857;--okS:#E6F6EF;--warn:#B45309;--warnS:#FEF3E2;--warnB:#F59E0B;--crit:#C81E1E;--critS:#FDECEC;--info:#0369A1;--infoS:#E5F2FA;--neu:#475569;--neuS:#F1F5F9;--focus:#2F5FE0;--scrim:rgba(15,23,42,0.45);--shadow:0 1px 2px rgba(15,23,42,0.06);--shadowL:0 16px 40px rgba(15,23,42,0.18);--nav:#0C1A3A;--navH:#16264F;--navTx:#FFFFFF;--navMut:#AAB6CF;--navLine:rgba(255,255,255,0.10);--navAct:#2F5FE0}
.th-dark{color-scheme:dark;--bg:#0A1224;--surf:#0F1B33;--surf2:#0C172C;--elev:#15233F;--tx:#E8EEF8;--tx2:#B6C2D6;--mut:#8D9BB3;--line:#24334F;--line2:#334566;--accent:#7EA2FF;--accentH:#A3BDFF;--onAccent:#0A1224;--accentS:#1B2B52;--ok:#4ADE9B;--okS:#0F2E22;--warn:#FBBF24;--warnS:#33260F;--warnB:#B7791F;--crit:#FF9C94;--critS:#3B1A1E;--info:#7DD3FC;--infoS:#0E2A3B;--neu:#B6C2D6;--neuS:#1A2740;--focus:#A3BDFF;--scrim:rgba(2,6,16,0.66);--shadow:none;--shadowL:0 16px 40px rgba(0,0,0,0.55);--nav:#071027;--navH:#13234A;--navTx:#FFFFFF;--navMut:#A3B0CB;--navLine:rgba(255,255,255,0.08);--navAct:#2F5FE0}
@media (prefers-color-scheme: dark){.th-system{color-scheme:dark;--bg:#0A1224;--surf:#0F1B33;--surf2:#0C172C;--elev:#15233F;--tx:#E8EEF8;--tx2:#B6C2D6;--mut:#8D9BB3;--line:#24334F;--line2:#334566;--accent:#7EA2FF;--accentH:#A3BDFF;--onAccent:#0A1224;--accentS:#1B2B52;--ok:#4ADE9B;--okS:#0F2E22;--warn:#FBBF24;--warnS:#33260F;--warnB:#B7791F;--crit:#FF9C94;--critS:#3B1A1E;--info:#7DD3FC;--infoS:#0E2A3B;--neu:#B6C2D6;--neuS:#1A2740;--focus:#A3BDFF;--scrim:rgba(2,6,16,0.66);--shadow:none;--shadowL:0 16px 40px rgba(0,0,0,0.55);--nav:#071027;--navH:#13234A;--navTx:#FFFFFF;--navMut:#A3B0CB;--navLine:rgba(255,255,255,0.08);--navAct:#2F5FE0}}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.nav-a:hover{background:var(--navH)}
.h1{margin:0;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.02em}
.sub{margin:4px 0 0;font-size:14px;color:var(--tx2)}
.h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-0.01em}
.lbl{font-size:13px;color:var(--tx2)}
.meta{font-size:12px;color:var(--mut)}
.mono{font-family:'Geist Mono',ui-monospace,monospace}
.num{font-variant-numeric:tabular-nums}
.card{background:var(--surf);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:9px;border:1px solid var(--line2);background:var(--surf);color:var(--tx);font:inherit;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;text-decoration:none}
.btn:hover{background:var(--surf2);text-decoration:none}
.btn-p{background:var(--accent);border-color:var(--accent);color:var(--onAccent)}.btn-p:hover{background:var(--accentH)}
.btn-ok{background:var(--ok);border-color:var(--ok);color:var(--surf)}
.btn-d{color:var(--crit)}.btn-d:hover{background:var(--critS)}
.btn-dp{background:var(--crit);border-color:var(--crit);color:var(--surf)}
.btn-g{border-color:transparent;background:transparent}
.btn-s{height:32px;padding:0 12px;font-size:13px;border-radius:8px}
.btn-xs{height:28px;padding:0 10px;font-size:12px;border-radius:7px}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.ib{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--tx2);cursor:pointer}
.ib:hover{background:var(--surf2);border-color:var(--line)}
.input,.select,.textarea{height:40px;padding:0 12px;border:1px solid var(--line2);border-radius:9px;background:var(--surf);color:var(--tx);font:inherit;font-size:14px;width:100%}
.textarea{height:auto;min-height:84px;padding:10px 12px;resize:vertical}
.input::placeholder,.textarea::placeholder{color:var(--mut)}
.input-s,.select-s{height:32px;font-size:13px;padding:0 10px;border-radius:8px}
.field{display:flex;flex-direction:column;gap:6px;min-width:0}
.field>label{font-size:13px;font-weight:500;color:var(--tx)}
.req{color:var(--crit)}
.help{font-size:12px;color:var(--mut)}
.err{font-size:12px;color:var(--crit);font-weight:500}
.is-err{border-color:var(--crit)!important}
.ai{border-color:var(--warnB)!important;background:var(--warnS)!important}
.src{font-size:12px;color:var(--warn)}
.chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);background:var(--surf);color:var(--tx);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.chip.on{background:var(--accentS);border-color:var(--accent);font-weight:600}
.chip.on-crit{background:var(--critS);border-color:var(--crit);color:var(--crit);font-weight:600}
.badge{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:600;white-space:nowrap}
.badge::before{content:"";width:6px;height:6px;border-radius:3px;background:currentColor;flex-shrink:0}
.b-neu{background:var(--neuS);color:var(--neu)}.b-acc{background:var(--accentS);color:var(--accent)}.b-info{background:var(--infoS);color:var(--info)}.b-ok{background:var(--okS);color:var(--ok)}.b-warn{background:var(--warnS);color:var(--warn)}.b-crit{background:var(--critS);color:var(--crit)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tab{height:40px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--tx2);font:inherit;font-size:14px;font-weight:500;cursor:pointer;margin-bottom:-1px}
.tab.on{color:var(--tx);border-bottom-color:var(--accent);font-weight:600}
.seg{display:inline-flex;padding:3px;gap:2px;border-radius:9px;background:var(--surf2);border:1px solid var(--line)}
.seg button{height:28px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--tx2);font:inherit;font-size:12px;font-weight:500;cursor:pointer}
.seg button.on{background:var(--elev);color:var(--tx);font-weight:600;box-shadow:0 0 0 1px var(--line)}
.tw{overflow:auto}
.tbl{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}
.tbl th{position:sticky;top:0;z-index:1;background:var(--surf2);text-align:left;font-size:12px;font-weight:600;color:var(--tx2);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap;vertical-align:middle;background:var(--surf)}
.tbl tbody tr:hover td{background:var(--surf2)}
.tbl tfoot td{background:var(--surf2);font-weight:600;border-bottom:0}
.tbl .r{text-align:right}
.stk{position:sticky;left:0;z-index:2}
.stk2{position:sticky;left:56px;z-index:2;box-shadow:1px 0 0 var(--line)}
.pen{color:var(--mut);opacity:0}
.tbl tr:hover .pen{opacity:1}
.dash{color:var(--mut)}
.kpi{padding:16px 18px;display:flex;flex-direction:column;gap:6px;min-width:0}
.kpi .v{font-size:26px;font-weight:600;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}
.banner{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;border:1px solid}
.bn-warn{background:var(--warnS);border-color:var(--warnB)}.bn-info{background:var(--infoS);border-color:var(--info)}.bn-crit{background:var(--critS);border-color:var(--crit)}.bn-ok{background:var(--okS);border-color:var(--ok)}
.scrim{position:absolute;inset:0;background:var(--scrim);display:flex;align-items:flex-start;justify-content:center;padding:56px 24px;z-index:20}
.modal{background:var(--elev);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadowL);width:100%;max-width:760px;overflow:hidden}
.mh{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 24px 12px}
.mb{padding:8px 24px 20px;display:flex;flex-direction:column;gap:16px}
.mf{display:flex;justify-content:flex-end;gap:10px;padding:14px 24px;border-top:1px solid var(--line);background:var(--surf2)}
.menu{background:var(--elev);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadowL);padding:6px;min-width:200px}
.opt{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 10px;border-radius:7px;font-size:13px;color:var(--tx)}
.opt.sel{background:var(--accentS);font-weight:600}
.sw{display:inline-flex;align-items:center;width:36px;height:20px;border-radius:10px;background:var(--line2);padding:2px;border:0;cursor:pointer}
.sw::after{content:"";width:16px;height:16px;border-radius:8px;background:var(--surf)}
.sw.on{background:var(--accent);justify-content:flex-end}
.drop{border:1.5px dashed var(--line2);border-radius:12px;padding:28px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;background:var(--surf2)}
.steps{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
```

## Design language (the "best in class" bar)
- Calm enterprise command-center. Navy sidebar (#0C1A3A) + accent blue (#2F5FE0) are the brand; everything else neutral. Color only for meaning.
- Page header: `.h1` title + `.sub` subtitle on the left, primary action (`.btn btn-p`) on the right, secondary actions as `.btn`.
- KPI row: `.card .kpi` in `display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:12px`. Label `.lbl`, value `.v`, small line `.meta`. Danger KPIs: value colored var(--crit) + a small icon; never color alone.
- Filters toolbar inside the table card's top: search input (with icon, `aria` label), then selects (`.select select-s`, width auto), toggle chips, a "Clear filters" link, results count, and Export on the right. Active filters show as removable chips row.
- Tables: inside `.card` with `overflow:hidden`; `.tw` scroll box with max-height; sticky header; sticky first columns (`.stk`, `.stk2`) for Sr. No. + key ID; numbers right-aligned `.r num`; IDs `.mono`; empty values `<span class="dash">—</span>`; editable cells show a pencil `.pen` icon on row hover (inline SVG 13px); row actions at the end, compact buttons; footer with "Showing x–y of n" + pager.
- Status: `.badge` + class from this map (text always visible):
  - Booking status: Draft b-neu · Confirmed b-acc · In Transit b-info · Delivered b-ok · Cancelled b-crit
  - Instruction Status: — (b-neu) · Sent b-ok · Not Sent b-crit
  - Release Status / Status (live): On Water b-info · Released b-ok · — set — b-neu
  - Invoice Sent / Docs Sent: Sent b-ok · Pending b-warn
  - Paid: PAID b-ok · UNPAID b-crit (buyer/supplier ledgers in app show UNPAID amber; use b-warn there for "Unpaid" not yet due and b-crit when overdue)
  - BL Status: Y b-ok · N b-neu
  - Roles: admin b-acc · operations b-info · finance b-ok · readonly b-neu
  - Team status: Active b-ok · Removed b-neu
  - Company status: Trial b-acc · Active b-ok · Suspended b-crit · Cancelled b-neu
  - Party role (P&L): Buyer b-ok · Forwarder b-acc · Supplier b-info · Trucker b-warn
- Dates: "19 Oct 2026, 10:00" style; cut-off within 48h shown with b-crit badge "in 15 h"; overdue "Overdue 2 d".
- Money: "$12,140.00" with currency code where mixed; negative "-$1,234.00" in var(--crit).
- AI-extracted fields: input class `ai` + line `<span class="src">from PDF: "…"</span>`; low confidence: `is-err` + err text "Low confidence — please verify".
- Every artboard ships a real-feeling state, plus where useful a secondary state rendered small (e.g. empty state card, error banner) so states are designed, not implied.
- Interactions to make live (Play): theme switch (all), tabs, toggle chips, segmented controls, expand/collapse rows, modal steps where cheap. Keep JS simple.
- Accessibility: labels on all inputs, `aria-sort` on sortable headers, `aria-expanded` on expanders, 32px+ hit targets, focus ring via :focus-visible.
- Icons: 16px stroke 1.8 inline SVG, `aria-hidden="true"`, `stroke="currentColor"`.

## Board list (file, h) — page "Final app (v2)"
Fork A: V2DesignSystem (2600, not an app page — no shell; a spec sheet), V2Login (950), V2Settings (1600), V2Admin (950)
Fork B: V2Bookings (1200), V2CellEditing (1100), V2UploadBL (1100), V2SendInstructions (1000), V2Multiple (1000)
Fork C: V2NewBooking (1300), V2Import (1000), V2BookingDetail (1300), V2Tracking (1200), V2FinalInvoice (1150)
Fork D: V2Buyers (1200), V2BuyerLedger (1400), V2Partners (1050), V2ForwarderLedger (1400)
Fork E: V2Freight (1200), V2OfferSheets (1300), V2ProfitLoss (1050)
Root `min-height` and `$preview.height` = h; width 1440.
