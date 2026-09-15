/**
 * Flashcard Card Editor — premium full-screen authoring sheet.
 *
 * Presentation only: it edits the builder's in-memory card and reuses the
 * existing shared Rich Text + Math editor, the existing flashcard image
 * uploader and the real student FlipCard for the live preview. No data fetching
 * or persistence happens here — the deck builder owns saving.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/richtext/RichTextEditor";
import { FlashcardMediaEditor, type FlashcardImageValue } from "@/components/flashcards/FlashcardMediaEditor";
import { FlipCard } from "@/components/flashcards/FlipCard";
import { MATH_BLOCK_NODE, MATH_INLINE_NODE, type RichDoc, type RichNode } from "@/lib/richContent";
import type { FlashcardCard } from "@/lib/flashcards";
import type { Json } from "@/integrations/supabase/types";

/** One card as held by the deck builder. `serverId` is null until persisted. */
export interface BuilderCard {
  key: string;
  serverId: string | null;
  front: string;
  back: string;
  frontDoc: RichDoc | null;
  backDoc: RichDoc | null;
  frontImage: FlashcardImageValue;
  backImage: FlashcardImageValue;
  tags: string[];
}

/** True when a rich document contains an equation node (inline or block). */
export function docHasMath(doc: RichDoc | null | undefined): boolean {
  const walk = (nodes: RichNode[] | undefined): boolean =>
    (nodes ?? []).some(
      (n) => n.type === MATH_INLINE_NODE || n.type === MATH_BLOCK_NODE || walk(n.content),
    );
  return walk(doc?.content);
}

/** Build the exact student-facing card shape from a builder row. */
export function toPreviewCard(card: BuilderCard, order = 0): FlashcardCard {
  return {
    id: card.serverId ?? card.key,
    front: card.front,
    back: card.back,
    front_content: (card.frontDoc ?? null) as unknown as Json,
    back_content: (card.backDoc ?? null) as unknown as Json,
    front_image_path: card.frontImage.image_path,
    front_image_width: card.frontImage.image_width,
    front_image_height: card.frontImage.image_height,
    front_image_alt: card.frontImage.image_alt,
    front_image_crop: card.frontImage.image_crop,
    back_image_path: card.backImage.image_path,
    back_image_width: card.backImage.image_width,
    back_image_height: card.backImage.image_height,
    back_image_alt: card.backImage.image_alt,
    back_image_crop: card.backImage.image_crop,
    tags: card.tags,
    display_order: order,
  };
}

export interface CardEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: BuilderCard | null;
  index: number;
  total: number;
  deckTitle: string;
  centerId: string | null;
  saveState: "saved" | "unsaved" | "saving" | "failed";
  onContent: (side: "front" | "back", doc: RichDoc) => void;
  onImage: (side: "front" | "back", patch: Partial<FlashcardImageValue>) => void;
  onTags: (raw: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
}

const SAVE_LABEL: Record<CardEditorSheetProps["saveState"], string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  failed: "Save failed",
};

export function CardEditorSheet({
  open,
  onOpenChange,
  card,
  index,
  total,
  deckTitle,
  centerId,
  saveState,
  onContent,
  onImage,
  onTags,
  onDuplicate,
  onDelete,
  onPrev,
  onNext,
  onSave,
}: CardEditorSheetProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [card?.key, open]);

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-gradient-to-b from-[hsl(258,80%,97%)] via-white to-[hsl(258,70%,97%)] p-0 [&>button.absolute]:hidden sm:left-1/2 sm:top-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:w-[min(1100px,94vw)] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-violet-100 bg-white/80 px-4 py-3 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            onClick={() => onOpenChange(false)}
            aria-label="Close card editor"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-extrabold text-slate-900">
              Edit card
            </DialogTitle>
            <p className="truncate text-[12px] text-slate-500">
              Card {index + 1} of {total}
              {deckTitle ? ` • ${deckTitle}` : ""}
            </p>
          </div>
          <span
            className={
              saveState === "failed"
                ? "shrink-0 rounded-full bg-rose-50 px-3 py-1.5 text-[12px] font-bold text-rose-600"
                : saveState === "saved"
                  ? "shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-600"
                  : "shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-600"
            }
          >
            {SAVE_LABEL[saveState]}
          </span>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-4">
          <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div className="space-y-4">
              <section className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_14px_34px_-26px_rgba(76,29,149,0.5)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">
                  Front of card
                </p>
                <p className="mt-0.5 mb-3 text-[12.5px] text-slate-500">
                  The prompt students see first. Use the toolbar for formatting, symbols and equations.
                </p>
                <RichTextEditor
                  value={card.frontDoc}
                  fallbackText={card.front}
                  ariaLabel={`Front of card ${index + 1}`}
                  placeholder="Prompt or question"
                  onChange={(doc) => onContent("front", doc)}
                />
                <div className="mt-3">
                  <FlashcardMediaEditor
                    centerId={centerId}
                    fieldId={`card-${card.key}-front-image`}
                    label="Front image"
                    value={card.frontImage}
                    onChange={(p) => onImage("front", p)}
                  />
                </div>
              </section>

              <section className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_14px_34px_-26px_rgba(76,29,149,0.5)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">
                  Back of card
                </p>
                <p className="mt-0.5 mb-3 text-[12.5px] text-slate-500">
                  The answer or explanation revealed after the flip.
                </p>
                <RichTextEditor
                  value={card.backDoc}
                  fallbackText={card.back}
                  ariaLabel={`Back of card ${index + 1}`}
                  placeholder="Answer or explanation"
                  onChange={(doc) => onContent("back", doc)}
                />
                <div className="mt-3">
                  <FlashcardMediaEditor
                    centerId={centerId}
                    fieldId={`card-${card.key}-back-image`}
                    label="Back image"
                    value={card.backImage}
                    onChange={(p) => onImage("back", p)}
                  />
                </div>
              </section>

              <section className="rounded-[24px] border border-violet-100 bg-white p-4">
                <Label htmlFor={`card-${card.key}-tags`} className="text-[12.5px] font-semibold text-slate-700">
                  Tags (optional)
                </Label>
                <Input
                  id={`card-${card.key}-tags`}
                  value={card.tags.join(", ")}
                  onChange={(e) => onTags(e.target.value)}
                  placeholder="Comma separated, e.g. definitions, chapter 3"
                  className="mt-1.5 min-h-[44px] rounded-2xl border-slate-200 text-[15px]"
                />
              </section>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDuplicate}
                  className="min-h-[44px] rounded-full text-[13.5px]"
                >
                  <Copy className="mr-1.5 h-4 w-4" /> Duplicate card
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDelete}
                  className="min-h-[44px] rounded-full text-[13.5px] text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete card
                </Button>
              </div>
            </div>

            {/* Live student preview — the real student card component. */}
            <aside className="space-y-2 lg:sticky lg:top-2">
              <p className="px-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                Student preview
              </p>
              <FlipCard
                card={toPreviewCard(card, index)}
                flipped={flipped}
                onFlip={() => setFlipped((f) => !f)}
                hint="Tap to reveal answer"
              />
              <p className="px-1 text-[12px] text-slate-500">
                Exactly what students see, including equations and images.
              </p>
            </aside>
          </div>
        </div>

        {/* Card navigation */}
        <div className="flex items-center gap-2 border-t border-violet-100 bg-white/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={onPrev}
            disabled={index === 0}
            className="min-h-[46px] shrink-0 rounded-full px-4"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saveState === "saving"}
            className="min-h-[46px] flex-1 rounded-full bg-violet-600 text-[15px] font-bold hover:bg-violet-700"
          >
            Save card
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onNext}
            disabled={index >= total - 1}
            className="min-h-[46px] shrink-0 rounded-full px-4"
            aria-label="Next card"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
