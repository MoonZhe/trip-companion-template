'use client';

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  hideLabel?: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className={hideLabel ? 'sr-only' : 'mb-2 text-sm font-medium text-ink-soft'}>{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-sunk p-1">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`min-h-12 rounded-xl px-3 text-[15px] font-medium transition active:scale-[0.98] ${
                on ? 'bg-card text-ink shadow-soft' : 'text-ink-soft'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
