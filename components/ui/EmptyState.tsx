import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted" size={20} />
      </div>
      <div className="text-sm font-medium text-text-2">{title}</div>
      {hint && <div className="text-xs text-muted max-w-sm">{hint}</div>}
    </div>
  );
}
