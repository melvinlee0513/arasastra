import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toSafeMessage } from "@/components/common/TenantGate";
import {
  HERO_COLOR_PRESETS,
  heroPresetFor,
  useSaveHeroColor,
  type HeroColorKey,
} from "@/lib/studentProfile";

interface HomeColorPickerProps {
  value: string | null | undefined;
}

/**
 * Personal Home hero colour. Curated presets only, all dark enough for the
 * white hero text, so contrast stays accessible for every choice.
 */
export function HomeColorPicker({ value }: HomeColorPickerProps) {
  const current = heroPresetFor(value).key;
  const save = useSaveHeroColor();

  const choose = (key: HeroColorKey) => {
    if (key === current || save.isPending) return;
    save.mutate(key, {
      onError: (e) => toast.error(toSafeMessage(e, "Couldn't save your colour.")),
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-slate-900">Personalisation</h2>
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <p className="text-[13.5px] font-medium text-slate-900">Home card colour</p>
        <p className="mt-0.5 text-[12.5px] text-slate-500">
          Only you see this. It doesn't change your centre's branding.
        </p>
        <ul role="radiogroup" aria-label="Home card colour" className="mt-3 flex flex-wrap gap-2.5">
          {HERO_COLOR_PRESETS.map((p) => {
            const selected = p.key === current;
            return (
              <li key={p.key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={p.label}
                  disabled={save.isPending}
                  onClick={() => choose(p.key)}
                  style={{ backgroundColor: p.background }}
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-full transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    selected
                      ? "ring-2 ring-slate-900 ring-offset-2"
                      : "ring-1 ring-slate-200 ring-offset-1",
                    save.isPending && "opacity-70",
                  )}
                >
                  {selected && <Check className="w-4 h-4 text-white" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12.5px] text-slate-500">
          Selected: <span className="font-medium text-slate-900">{heroPresetFor(value).label}</span>
        </p>
      </div>
    </section>
  );
}

export default HomeColorPicker;
