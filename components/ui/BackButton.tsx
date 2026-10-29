"use client";

import Link from "next/link";

// Square icon back button that sits to the left of a page title, matching
// design-v2's import screens. Pass either an href (renders a Link) or an
// onClick (renders a button, e.g. to step back within a wizard).
const CLASS =
  "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg border border-line bg-surface hover:bg-surface-2 text-text-2 shadow-sm";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function BackButton({ href, onClick, label = "Back" }: { href?: string; onClick?: () => void; label?: string }) {
  if (href) {
    return (
      <Link href={href} aria-label={label} className={CLASS}>
        <ArrowIcon />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={CLASS}>
      <ArrowIcon />
    </button>
  );
}
