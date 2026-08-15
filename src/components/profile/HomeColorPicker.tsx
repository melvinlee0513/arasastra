import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toSafeMessage } from "@/components/common/TenantGate";
import { PROFILE_ART } from "@/lib/studentIllustrations";
import { ProfileSectionCard } from "@/components/profile/ProfileChrome";
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
 *
 * Visual-only redesign — storage/application of the selected colour is
 * unchanged (`useSaveHeroColor`).
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
    <ProfileSectionCard
      art={PROFILE_ART.palette}
      title="Personalisation"
      accentArt={PROFILE_ART.paintbrush}
      showSparkle
    >
      <div className="rounded-[22px] border border-sky-100/80 bg-[#fbfdff] p-3.5 sm:p-4">
        <p className="text-[15px] font-bold text-[#0F172A]">Home card colour</p>
        <p className="mt-1 text-[13px] leading-snug text-slate-500">
          Only you see this. It doesn't change your centre's branding.
        </p>

        <ul
          role="radiogroup"
          aria-label="Home card colour"
          className="mt-4 flex flex-wrap gap-3 sm:gap-3.5"
        >
          {HERO_COLOR_PRESETS.map((p) => {
            const selected = p.key === current;
            return (
              <li key={p.key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={
                    selected
                      ? `${p.label} home card (selected)`
                      : `${p.label} home card`
                  }
                  disabled={save.isPending}
                  onClick={() => choose(p.key)}
                  style={{ backgroundColor: p.background }}
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-full sm:h-[52px] sm:w-[52px]",
                    "border-[3px] border-white transition-all duration-[170ms] motion-reduce:transition-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    "active:scale-[0.97] motion-reduce:active:scale-100",
                    selected
                      ? "ring-[3px] ring-primary ring-offset-2 shadow-[0_6px_18px_rgba(37,99,235,0.35)] sm:-translate-y-0.5"
                      : "shadow-[0_3px_10px_rgba(15,23,42,0.14)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
                    save.isPending && "opacity-70",
                  )}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary ring-2 ring-white"
                    >
                      <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
                    </span>
                  )}
                </button>

              </li>
            );
          })}
        </ul>

        <div className="mt-4 rounded-2xl border border-sky-100/80 bg-white px-3.5 py-2.5">
          <p className="text-[13.5px] text-slate-500">
            Selected:{" "}
            <span className="font-bold text-primary">{heroPresetFor(value).label}</span>
          </p>
        </div>
      </div>
    </ProfileSectionCard>
  );
}

export default HomeColorPicker;
