import type { SVGProps } from "react";
import { brand } from "../../brand";

/** Two soft light bands form an open L. Single-color at every size. */
export function LumiMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
    <path d="M12 6h8v23c0 5 3 8 8 8h14v5H25c-8 0-13-5-13-13V6Z" fill="currentColor" />
    <path d="M25 25c6 0 11-3 17-9v10c-5 5-10 7-17 7v-8Z" fill="currentColor" />
  </svg>;
}

export function LumiLogo({ variant = "full", className = "" }: {
  variant?: "icon" | "wordmark" | "full";
  className?: string;
}) {
  return <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`} aria-label={brand.name}>
    {variant !== "wordmark" && <LumiMark width={32} height={32} />}
    {variant !== "icon" && <span>{brand.name}</span>}
  </span>;
}
