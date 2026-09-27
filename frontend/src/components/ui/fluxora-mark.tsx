import type { SVGProps } from "react";

/** Folded film frames form an F; inherits the current brand color. */
export function FluxoraMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
    <path d="M9 11 32 5l8 7-23 6v24l-8-7V11Z" fill="currentColor" />
    <path d="m21 22 15-4 7 7-22 6v-9Z" fill="currentColor" opacity=".72" />
    <path d="m17 18 23-6-8-7 8 7-23 6Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 5v8M5 5h8M43 43h-8M43 43v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".4" />
  </svg>;
}
