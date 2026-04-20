import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export function SlotSkeleton() {
  return (
    <div className="border-2 border-foreground/20 border-l-4 border-l-foreground/10 px-5 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-40 animate-pulse bg-foreground/10" />
            <div className="h-4 w-14 animate-pulse bg-foreground/10" />
          </div>
          <div className="flex gap-5">
            <div className="h-3 w-28 animate-pulse bg-foreground/10" />
            <div className="h-3 w-28 animate-pulse bg-foreground/10" />
            <div className="h-3 w-16 animate-pulse bg-foreground/10" />
          </div>
          <div className="h-1.5 w-full animate-pulse bg-foreground/10" />
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="h-9 w-16 animate-pulse bg-foreground/10" />
          <div className="h-9 w-24 animate-pulse bg-foreground/10" />
          <div className="h-9 w-20 animate-pulse bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

export function StatCell({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">
        {label}
      </span>
      <span className={`text-3xl font-black leading-none ${accent}`}>{value}</span>
    </div>
  );
}

export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs font-bold uppercase tracking-wider text-destructive">
          ↳ {error}
        </p>
      )}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-destructive text-destructive-foreground p-5">
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <p className="text-base font-bold uppercase tracking-wide leading-snug">{message}</p>
    </div>
  );
}