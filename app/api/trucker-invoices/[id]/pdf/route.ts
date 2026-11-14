import { NextRequest } from "next/server";
import { handleInvoicePdfUpload } from "@/lib/party-invoice-pdf";

// Stores the PDF this trucker invoice was entered from (lib/party-invoice-pdf.ts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return handleInvoicePdfUpload(req, "trucker", params.id);
}
