"use client";

import { useEffect, useState } from "react";

// Replaces the old PDF-based "Generate Instructions" button - per
// Tanishq's real example, these go out as an email BODY to the
// forwarder, never a PDF attachment (lib/email/generateInstructionsEmail.ts
// + app/api/bookings/[id]/instructions-email/route.ts). Opens a compose
// modal with a live preview before anything actually sends.
export default function SendInstructionsCell({
  bookingId,
  containerId,
}: {
  bookingId: string;
  containerId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <td className="px-3 py-2 whitespace-nowrap relative">
      <button
        onClick={() => setOpen(true)}
        className="text-xs border border-accent text-accent px-2 py-1 rounded hover:bg-accent hover:text-white"
      >
        Send Instructions
      </button>
      {open && <ComposeModal bookingId={bookingId} containerId={containerId} onClose={() => setOpen(false)} />}
    </td>
  );
}

function ComposeModal({
  bookingId,
  containerId,
  onClose,
}: {
  bookingId: string;
  containerId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/instructions-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container_id: containerId, preview: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to build preview");
      setSubject(json.subject);
      setHtml(json.html);
      if (json.suggested_to) setTo(json.suggested_to);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) {
      setError("At least one \"To\" recipient is required.");
      return;
    }
    const ccList = cc.split(",").map((s) => s.trim()).filter(Boolean);
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/instructions-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ container_id: containerId, to: toList, cc: ccList }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send");
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">Send Booking Instructions</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-sm">✕</button>
        </div>

        {loading && <div className="text-sm text-ink/50 py-8 text-center">Building preview…</div>}

        {!loading && error && !html && (
          <div className="text-sm text-cutoff bg-red-50 rounded px-3 py-2">{error}</div>
        )}

        {!loading && html && !sent && (
          <>
            <div className="grid grid-cols-1 gap-2 mb-3">
              <input
                placeholder="To (comma-separated)"
                className="border rounded px-2 py-1.5 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <input
                placeholder="Cc (comma-separated, optional)"
                className="border rounded px-2 py-1.5 text-sm"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
              <input className="border rounded px-2 py-1.5 text-sm bg-slate-50" value={subject} readOnly />
            </div>

            <div className="border rounded p-3 bg-slate-50 max-h-[40vh] overflow-auto mb-3">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>

            {error && <div className="text-xs text-cutoff mb-2">{error}</div>}

            <div className="flex gap-2">
              <button onClick={send} disabled={sending} className="text-sm bg-accent text-white px-4 py-2 rounded font-medium disabled:opacity-50">
                {sending ? "Sending…" : "Send Email"}
              </button>
              <button onClick={onClose} className="text-sm border px-4 py-2 rounded">
                Cancel
              </button>
            </div>
          </>
        )}

        {sent && (
          <div className="text-center py-6">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 inline-block">Instructions sent.</p>
            <div className="mt-4">
              <button onClick={onClose} className="text-sm border px-4 py-2 rounded">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
