import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p id={fieldErrorId(id)} className="flex items-center gap-2 text-xs text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
