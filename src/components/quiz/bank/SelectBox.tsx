/**
 * A checkbox whose TAP TARGET is 44px, not just its artwork.
 *
 * shadcn's Checkbox renders a 16px box, which is the whole interactive element
 * — on a phone that is a quarter of the 44px minimum, and it measured 16x16 in
 * every viewport. This keeps the small visual box the design calls for and puts
 * it inside a real 44x44 button, so the thing a thumb has to hit is the thing
 * the guideline is about.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function SelectBox({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Required: these controls are icon-only, so they need an accessible name. */
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-95",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-2 transition",
          checked
            ? "border-quiz-accent bg-quiz-accent text-white"
            : "border-slate-300 bg-white",
        )}
        aria-hidden="true"
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export default SelectBox;
