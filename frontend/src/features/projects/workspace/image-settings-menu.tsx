import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../../../components/ui/dropdown-menu";
import { cn } from "../../../lib/cn";
import {
  COUNTS,
  RATIOS,
  RESOLUTIONS,
  settingsSummary,
  type RatioId,
  type ResolutionId,
} from "../image-settings";

export function ImageSettingsMenu({
  resolution,
  ratio,
  count,
  onResolution,
  onRatio,
  onCount,
}: {
  resolution: ResolutionId;
  ratio: RatioId;
  count: number;
  onResolution: (value: ResolutionId) => void;
  onRatio: (value: RatioId) => void;
  onCount: (value: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-xs text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <span className="truncate">{settingsSummary(resolution, ratio, count)}</span>
        <ChevronDown aria-hidden size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[min(360px,calc(100vw-32px))] rounded-xl p-3"
        side="top"
      >
        <SettingsGroup label="分辨率">
          <div className="grid grid-cols-2 gap-2">
            {RESOLUTIONS.map(([value, label]) => (
              <OptionButton
                active={resolution === value}
                disabled={ratio === "auto"}
                key={value}
                onClick={() => onResolution(value)}
              >
                {label}
              </OptionButton>
            ))}
          </div>
        </SettingsGroup>
        <SettingsGroup label="比例">
          <div className="grid grid-cols-5 gap-2">
            {RATIOS.map(([value, label]) => (
              <OptionButton active={ratio === value} key={value} onClick={() => onRatio(value)}>
                <RatioMark ratio={value} />
                {label}
              </OptionButton>
            ))}
          </div>
        </SettingsGroup>
        <SettingsGroup label="生成数量">
          <div className="grid grid-cols-4 gap-2">
            {COUNTS.map((value) => (
              <OptionButton active={count === value} key={value} onClick={() => onCount(value)}>
                {value}
              </OptionButton>
            ))}
          </div>
        </SettingsGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <p className="mb-2 text-xs text-muted">{label}</p>
      {children}
    </div>
  );
}

function OptionButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px]",
        active ? "border-line bg-canvas text-ink" : "border-transparent bg-canvas/40 text-muted",
        disabled && "opacity-40",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function RatioMark({ ratio }: { ratio: string }) {
  if (ratio === "auto") {
    return <span className="size-4 rounded-[3px] border border-dashed border-current" />;
  }
  const [width, height] = ratio.split(":").map(Number);
  const scale = 16 / Math.max(width, height);
  return (
    <span
      className="rounded-[3px] border border-current"
      style={{
        width: Math.max(8, Math.round(width * scale)),
        height: Math.max(8, Math.round(height * scale)),
      }}
    />
  );
}
