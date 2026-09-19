import { Ship } from "lucide-react";

// The Ship-Sphere mark: blue badge, white ship glyph. Kept as one small
// component so it can be reused anywhere (sidebar, login screen, PDF
// letterhead, favicon export) without copy-pasting the same div/icon pair.
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      className="rounded-lg bg-accent flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <Ship className="text-white" size={size * 0.58} strokeWidth={2.25} />
    </div>
  );
}
