import { Star } from "lucide-react";

export function Stars({
  value,
  size = 16,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={
            i <= Math.round(value) ? "fill-brand-red text-brand-red" : "text-muted-foreground/40"
          }
        />
      ))}
    </span>
  );
}

export function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onChange(i)}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className="rounded p-1 transition-transform hover:scale-110 disabled:opacity-50"
        >
          <Star
            className={`h-6 w-6 ${
              i <= value ? "fill-brand-red text-brand-red" : "text-muted-foreground/50"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
