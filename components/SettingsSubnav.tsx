"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "acct", label: "Your Account" },
  { id: "lh", label: "Document Letterhead" },
  { id: "mail", label: "Email Sending" },
  { id: "users", label: "Manage Users" },
];

// Anchor-style section nav - "active" is just whichever one was last
// clicked (or whatever's in the URL hash on load), not a scroll-spy: the
// reference design does the same (plain click-to-active, no
// IntersectionObserver), and a real scroll-spy isn't worth the added
// complexity for four short anchors on one page.
export default function SettingsSubnav() {
  const [active, setActive] = useState("acct");

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (SECTIONS.some((s) => s.id === hash)) setActive(hash);
  }, []);

  return (
    <nav aria-label="Settings sections" className="settings-subnav">
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={active === s.id ? "on" : ""} onClick={() => setActive(s.id)}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
