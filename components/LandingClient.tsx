"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/ui/Logo";
import "@/app/landing.css";

// Public landing page shown at "/" to signed-out visitors (owner's design,
// 2026-11). Signed-in users never see it: middleware.ts sends them straight
// to /bookings. "Request a demo" / "Get in touch" / "Contact" open a short
// form that POSTs to /api/demo-request, which emails the owner.

type FormState = { name: string; email: string; phone: string; company: string; message: string; website: string };
const EMPTY: FormState = { name: "", email: "", phone: "", company: "", message: "", website: "" };

function DemoDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const openedAt = useRef(Date.now());
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, elapsed_ms: Date.now() - openedAt.current }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send your request. Please try again.");
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="demo-title">
        {done ? (
          <div className="done">
            <div className="tick">✓</div>
            <h3 id="demo-title">Thank you!</h3>
            <p className="sub">We&apos;ve received your request and will get back to you shortly.</p>
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3 id="demo-title">Request a demo</h3>
            <p className="sub">Tell us a little about you and we&apos;ll reach out to set up a walkthrough.</p>
            {error && <div className="form-error">{error}</div>}
            <label className="field">
              <span>Full name *</span>
              <input required maxLength={100} value={f.name} onChange={set("name")} autoComplete="name" autoFocus />
            </label>
            <div className="row2">
              <label className="field">
                <span>Work email *</span>
                <input required type="email" maxLength={200} value={f.email} onChange={set("email")} autoComplete="email" />
              </label>
              <label className="field">
                <span>Phone / WhatsApp *</span>
                <input required type="tel" maxLength={30} value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="+1 555 123 4567" />
              </label>
            </div>
            <label className="field">
              <span>Company</span>
              <input maxLength={150} value={f.company} onChange={set("company")} autoComplete="organization" />
            </label>
            <label className="field">
              <span>How can we help?</span>
              <textarea rows={3} maxLength={2000} value={f.message} onChange={set("message")} placeholder="e.g. number of bookings per month, current tools..." />
            </label>
            {/* Spam trap: hidden from people, bots fill it in. */}
            <label className="hp" aria-hidden="true">
              Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-light" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? "Sending…" : "Send request"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LandingClient() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".reveal") ?? [];
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.1, root: rootRef.current }
    );
    els.forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, []);

  const openDemo = () => {
    setMenuOpen(false);
    setDemoOpen(true);
  };

  return (
    <div className="lp" ref={rootRef}>
      <header className="site-header">
        <div className="container nav">
          <a className="logo" href="#home" aria-label="Ship-Sphere home">
            <span className="lp-logo-mark" aria-hidden="true"><Logo size={36} /></span>
            <span>Ship-Sphere</span>
          </a>
          <nav className={`nav-links${menuOpen ? " open" : ""}`} id="navigation" aria-label="Main navigation">
            <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#why" onClick={() => setMenuOpen(false)}>Why Ship-Sphere</a>
          </nav>
          <div className="nav-actions">
            <Link className="btn btn-light" href="/login">Sign in</Link>
            <button className="btn btn-primary" onClick={openDemo}>Request a demo <span aria-hidden="true">↗</span></button>
            <button className="menu-btn" aria-controls="navigation" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          </div>
        </div>
      </header>
      <main>
        <section className="hero" id="home">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow"><span className="dot" /> A clearer way to manage freight</span>
              <h1>Freight forwarding, <span>beautifully connected.</span></h1>
              <p className="lead">One calm workspace for bookings, shipment tracking, documents, invoices and the teams moving cargo forward.</p>
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={openDemo}>Request a demo <span aria-hidden="true">↗</span></button>
                <a className="btn btn-light" href="#features">Explore the platform ↓</a>
              </div>
              <p className="micro">Built for the details behind every shipment.</p>
            </div>
            <div className="mockup" role="img" aria-label="Illustrative Ship-Sphere operations dashboard preview">
              <div className="mock-top">
                <div className="mock-dots"><i /><i /><i /></div>
                <span>Ship-Sphere / Operations</span>
                <span>● Connected workspace</span>
              </div>
              <div className="mock-body">
                <div className="mock-side">
                  <div style={{ color: "white", fontWeight: 750 }}>Ship-Sphere</div>
                  <div className="on">Bookings</div>
                  <div>Tracking</div>
                  <div>Forwarders</div>
                  <div>Invoices</div>
                  <div>Reports</div>
                </div>
                <div className="mock-main">
                  <h3>Booking &amp; Instructions</h3>
                  <div className="stats">
                    <div className="stat"><small>Total bookings</small><b>248</b></div>
                    <div className="stat"><small>In transit</small><b>64</b></div>
                    <div className="stat"><small>Needs attention</small><b style={{ color: "#c05237" }}>12</b></div>
                  </div>
                  <div className="mock-table">
                    <div className="mock-row"><span>Booking</span><span>Destination</span><span>Stage</span><span>Status</span></div>
                    <div className="mock-row"><span>BK-24081</span><span>Mundra</span><span>On water</span><span className="tag">On track</span></div>
                    <div className="mock-row"><span>BK-24082</span><span>Nhava Sheva</span><span>Confirmed</span><span className="tag">Ready</span></div>
                    <div className="mock-row"><span>BK-24083</span><span>Chennai</span><span>Released</span><span className="tag">Done</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="container">
            <div className="section-title reveal">
              <div className="kicker">Everything in its place</div>
              <h2>Less chasing. More moving.</h2>
              <p>Bring the work around each shipment into one connected, easy-to-navigate experience.</p>
            </div>
            <div className="features">
              {[
                ["▤", "Bookings & instructions", "Keep shipment details, cut-offs and instructions organized in one place."],
                ["◎", "Shipment tracking", "See progress and identify what needs attention without hunting across spreadsheets."],
                ["▧", "Documents & imports", "Work with shipping documents and Excel imports through guided workflows."],
                ["⇄", "Connected partners", "Manage buyers, forwarders, suppliers and truckers within the same workspace."],
                ["＄", "Invoices & payments", "Keep invoice records and payment history close to the shipment context."],
                ["▥", "Operational visibility", "See what is moving, what is waiting and what needs the team's next action."],
              ].map(([icon, title, text]) => (
                <article className="feature reveal" key={title}>
                  <div className="feature-icon">{icon}</div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section soft" id="workflow">
          <div className="container split">
            <div className="reveal">
              <div className="kicker">Designed around your work</div>
              <h2>From first booking to final delivery.</h2>
              <p className="section-copy">Ship-Sphere follows the flow of real freight operations, helping your team move between records without losing context.</p>
              <ul className="checks">
                <li>One booking as the shared reference point</li>
                <li>Clear status and cut-off visibility</li>
                <li>Documents and invoices within reach</li>
                <li>Focused screens built for daily operations</li>
              </ul>
            </div>
            <div className="panel reveal">
              <div className="panel-head">A CONNECTED SHIPMENT WORKFLOW</div>
              {["Create and confirm booking", "Assign parties and send instructions", "Track shipment milestones", "Manage documents and invoices", "Review delivery and financial records"].map((s, i) => (
                <div className="flow-step" key={s}><b>{i + 1}</b><span>{s}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="why">
          <div className="container split">
            <div className="reveal">
              <div className="kicker">The Ship-Sphere philosophy</div>
              <h2>Powerful workflows. A quieter interface.</h2>
              <p className="section-copy">Logistics is complex enough. Your software shouldn&apos;t add to the noise. We believe important details deserve clarity, and everyday work deserves thoughtful design.</p>
              <Link href="/login" className="btn btn-light">Sign in to your workspace ↗</Link>
            </div>
            <div className="panel reveal" style={{ background: "linear-gradient(145deg,#142d61,#0d1b3d)", minHeight: 340, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 15, color: "#a8c0ef", marginBottom: 22 }}>One Booking. All Connected.</div>
              <div style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 760, lineHeight: 1.16, letterSpacing: "-.045em" }}>A better view of the work that moves the world.</div>
              <div style={{ height: 4, width: 85, background: "#6e95ff", borderRadius: 5, marginTop: 28 }} />
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="container">
            <h2>Make room for what matters.</h2>
            <p>Bring your shipment workflows into one thoughtful workspace.</p>
            <button className="btn btn-primary" onClick={openDemo}>Get in touch ↗</button>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <span>© {new Date().getFullYear()} Ship-Sphere. One Booking. All Connected.</span>
          <span>
            <Link href="/login">Sign in</Link> ·{" "}
            <button onClick={openDemo} style={{ background: "none", border: 0, padding: 0, color: "inherit", fontSize: "inherit" }}>Contact</button>
          </span>
        </div>
      </footer>
      {demoOpen && <DemoDialog onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
