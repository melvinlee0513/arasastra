import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layers, Loader2, PlayCircle, RotateCcw, CheckCircle2, Sparkles } from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import {
  flashcardStudentKeys,
  formatFlashcardRelative,
  listClassFlashcardDecksForStudent,
  mapFlashcardError,
  type FlashcardDeckStudentRow,
} from "@/lib/flashcards";

/**
 * Student flashcard library for one enrolled class. Every read goes through
 * `list_class_flashcard_decks_for_student`, so published status, active
 * enrolment, tenant and the `flashcards` feature flag are enforced server-side.
 */
export function StudentClassFlashcards() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const flashcardsOn = useFeatureEnabled("flashcards");

  const decksQuery = useQuery({
    queryKey: flashcardStudentKeys.list(currentTenantId, classId ?? "none", user?.id),
    enabled: !!classId && !!user && !!ctx.data?.canView && flashcardsOn,
    queryFn: () => listClassFlashcardDecksForStudent(classId!),
  });

  const basePath = `/dashboard/classes/${classId}`;
  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="student"
      section="flashcards"
      basePath={basePath}
      materialsPath={`${basePath}/materials`}
      breadcrumbs={[
        { label: "Dashboard", to: "/dashboard" },
        { label: "My Classes", to: "/dashboard/classes" },
        { label: ctx.data?.klass?.title || "Class", to: basePath },
        { label: "Flashcards" },
      ]}
    >
      {children}
    </ClassShell>
  );

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;
  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body="Please try again." />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant))
    return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canView)
    return shell(<Msg title="Access restricted" body="You're not enrolled in this class." />);

  if (ctx.isLoading || decksQuery.isLoading) {
    return shell(
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-3xl" />
        ))}
      </div>,
    );
  }

  if (decksQuery.isError) {
    return shell(<Msg title="Couldn't load flashcards" body={mapFlashcardError(decksQuery.error)} />);
  }

  const decks = decksQuery.data ?? [];
  const studiable = decks.filter((d) => d.card_count > 0);

  if (studiable.length === 0) {
    return shell(
      <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
          <Layers className="w-6 h-6" />
        </div>
        <p className="mt-3 font-semibold text-slate-700">No flashcard decks yet</p>
        <p className="text-sm text-slate-500">Check back once your tutor publishes a deck.</p>
      </div>,
    );
  }

  return shell(
    <div className="grid gap-4 sm:grid-cols-2">
      {studiable.map((deck) => (
        <DeckCard
          key={deck.id}
          deck={deck}
          onStudy={() => navigate(`${basePath}/flashcards/${deck.id}/study`)}
        />
      ))}
    </div>,
  );
}

function DeckCard({ deck, onStudy }: { deck: FlashcardDeckStudentRow; onStudy: () => void }) {
  const done = Math.min(deck.completed_card_count ?? 0, deck.card_count);
  const pct = deck.card_count > 0 ? Math.round((done / deck.card_count) * 100) : 0;
  const runComplete = !!deck.run_completed_at || (deck.card_count > 0 && done >= deck.card_count);
  const label = runComplete ? "Review again" : deck.started ? "Continue" : "Start studying";
  const Icon = runComplete ? RotateCcw : PlayCircle;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 truncate">{deck.title}</h3>
          {deck.description && <p className="text-sm text-slate-500 line-clamp-2">{deck.description}</p>}
        </div>
        {deck.completed && (
          <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100 shrink-0">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Done
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {done} of {deck.card_count} cards
          </span>
          <span>{deck.last_studied_at ? formatFlashcardRelative(deck.last_studied_at) : "Not started"}</span>
        </div>
        <Progress value={pct} className="h-2" aria-label={`${pct}% complete`} />
      </div>

      <Button onClick={onStudy} className="rounded-full w-full min-h-[44px]">
        <Icon className="w-4 h-4 mr-1.5" /> {label}
      </Button>
    </div>
  );
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 mt-2">{body}</p>
    </div>
  );
}

export default StudentClassFlashcards;
