// Renders the "Booking Instructions" email body to match Tanishq's real
// example verbatim (see the "REQUIRE SHIPPING INSTRUCTIONS" sample
// forwarded from Outlook/Gmail): a plain greeting, a Booking/Container/
// Seal/Weight/Bales block, yellow-highlighted section headers, a
// Consignee & Notify Party block, Description of Goods/H.S. Code/Value,
// a cyan "SHIPPER DECLARES" clause box, and a colored sign-off. This is
// sent as the email BODY, never a PDF attachment - that was the
// original (wrong) design this replaces.

export type CompanyLetterhead = {
  company_name: string;
  address_lines: string[];
  phone?: string;
  fax?: string;
  email?: string;
};

export type ConsigneeDetails = {
  legal_name: string;
  address: string; // multi-line, \n separated
  gst_no?: string | null;
  iec_code?: string | null;
  pan_no?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export type InstructionsEmailData = {
  greeting_team: string; // e.g. "Ual Team" -> "Dear Ual Team ,"
  booking_no: string;
  container_no: string;
  seal_no: string;
  weight: string;
  weight_unit: string;
  bales: string;
  shipper: CompanyLetterhead;
  consignee: ConsigneeDetails;
  description_of_goods: string;
  hs_code: string;
  value: string; // e.g. "$7000"
  transit_destination: string; // e.g. "KANDLA SPECIAL ECONOMIC ZONE (INKDL6)"
  sign_off_name: string; // e.g. "Kajol"
  sign_off_email: string;
  sign_off_website: string;
  sign_off_company: string; // e.g. "CN INTERNATIONALUSA INC."
};

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nl2br(s: string): string {
  return escapeHtml(s).split("\n").filter(Boolean).join("<br>");
}

const HIGHLIGHT = "background-color:#ffff00;";
const CYAN_BOX = "background-color:#9ff5f5;border:1px solid #333;padding:8px 10px;max-width:480px;";

export function generateInstructionsEmail(data: InstructionsEmailData): { subject: string; html: string } {
  const subject = `Instruction For Booking - ${data.booking_no}${data.container_no ? ` - ${data.container_no}` : ""}`;

  const html = `
<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000;line-height:1.5;">
  <p>Dear ${escapeHtml(data.greeting_team)} ,</p>
  <p>Here is the instructions</p>

  <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
    <tr><td style="padding-right:24px;">BOOKING NO.</td><td>${escapeHtml(data.booking_no)}</td></tr>
    <tr><td style="padding-right:24px;">CONTAINER NO.</td><td>${escapeHtml(data.container_no)}</td></tr>
    <tr><td style="padding-right:24px;">SEAL NO.</td><td>${escapeHtml(data.seal_no)}</td></tr>
    <tr><td style="padding-right:24px;">WEIGHT</td><td>${escapeHtml(data.weight)} ${escapeHtml(data.weight_unit)}</td></tr>
    <tr><td style="padding-right:24px;">BALES</td><td>${escapeHtml(data.bales)}</td></tr>
  </table>

  <p style="${HIGHLIGHT}"><b>Shipper/Exporter (Complete name and address)</b></p>
  <p style="margin:2px 0;"><b>${escapeHtml(data.shipper.company_name)}</b></p>
  ${data.shipper.address_lines.map((l) => `<p style="margin:2px 0;"><u>${escapeHtml(l)}</u></p>`).join("\n  ")}
  <p style="margin:2px 0;"><b>VOICE: ${escapeHtml(data.shipper.phone ?? "")}${data.shipper.fax ? ` - FAX: ${escapeHtml(data.shipper.fax)}` : ""}</b></p>
  ${data.shipper.email ? `<p style="margin:2px 0;"><b>E-mail: ${escapeHtml(data.shipper.email)}</b></p>` : ""}

  <p style="${HIGHLIGHT}margin-top:16px;"><b>Consignee &amp; Notify Party (complete details)</b></p>
  <p style="margin:2px 0;"><b>${escapeHtml(data.consignee.legal_name)}</b></p>
  <p style="margin:2px 0;">${nl2br(data.consignee.address)}</p>
  ${data.consignee.gst_no ? `<p style="margin:2px 0;">GST NO. ${escapeHtml(data.consignee.gst_no)}</p>` : ""}
  ${
    data.consignee.iec_code || data.consignee.pan_no
      ? `<p style="margin:2px 0;">${data.consignee.iec_code ? `IEC NO. ${escapeHtml(data.consignee.iec_code)}` : ""}${
          data.consignee.iec_code && data.consignee.pan_no ? " ," : ""
        }${data.consignee.pan_no ? `PAN NO. ${escapeHtml(data.consignee.pan_no)}` : ""}</p>`
      : ""
  }
  ${data.consignee.mobile ? `<p style="margin:2px 0;">Mobile: ${escapeHtml(data.consignee.mobile)}</p>` : ""}
  ${data.consignee.email ? `<p style="margin:8px 0;">Email:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="mailto:${escapeHtml(data.consignee.email)}">${escapeHtml(data.consignee.email)}</a></p>` : ""}

  <p style="${HIGHLIGHT}margin-top:16px;"><b>Description of Goods</b></p>
  <p>${escapeHtml(data.description_of_goods)}</p>

  <p style="margin:2px 0;">H.S.CODE :</p>
  <p style="margin:2px 0 16px;">${escapeHtml(data.hs_code)}</p>

  <p style="margin:2px 0;">Value ${escapeHtml(data.value)}</p>
  <p style="${HIGHLIGHT}"><b>PLEASE ADD THIS CLAUSE ON BL .</b></p>

  <p style="margin-top:12px;">PLEASE ADD THIS CLAUSE ON BL</p>
  <div style="${CYAN_BOX}">
    <b>SHIPPER DECLARES:</b><br>
    "CARGO IN TRANSIT TO ${escapeHtml(data.transit_destination)} TO BE ARRANGED BY CONSIGNEE AT THEIR OWN RISK &amp; EXPENSE".
  </div>

  <p style="color:#c000c0;margin-top:28px;margin-bottom:0;">Thanks &amp; Regards,</p>
  <p style="color:#008000;margin:2px 0;">${escapeHtml(data.sign_off_name)}</p>
  <p style="color:#008000;margin:2px 0;">Email Id - ${escapeHtml(data.sign_off_email)}</p>
  <p style="color:#008000;margin:2px 0;">Website - ${escapeHtml(data.sign_off_website)}</p>
  <p style="color:#008000;margin:2px 0;">${escapeHtml(data.sign_off_company)}</p>
</div>`.trim();

  return { subject, html };
}
