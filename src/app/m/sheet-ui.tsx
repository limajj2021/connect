"use client";

/**
 * Shared LIFF building blocks, modelled on a bottom-sheet: a centered bold
 * title with a grey subtitle, and a pill-shaped segmented control (grey
 * track, brand-yellow selected pill) for switching views without leaving
 * the page.
 */
export function SheetHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="space-y-3 px-4 pb-3 pt-4">
      <div className="text-center">
        <h1 className="text-lg font-bold tracking-wide">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm transition-colors ${
              selected ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
