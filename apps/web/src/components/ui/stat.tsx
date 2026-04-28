import { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatProps {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}

const toneClasses: Record<NonNullable<StatProps["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function Stat({ label, value, unit, hint, tone = "default", className }: StatProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface/60 p-4", className)}>
      <div className="text-xs uppercase tracking-wider text-muted mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-3xl font-semibold tabular-nums", toneClasses[tone])}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-muted mt-2 leading-relaxed">{hint}</div>}
    </div>
  );
}
