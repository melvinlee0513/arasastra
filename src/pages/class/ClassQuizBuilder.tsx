/**
 * Tutor / Admin quiz builder — thin controller.
 *
 * Owns loading, draft state, wizard navigation, optimistic version, locked
 * state, validation routing and the save/publish mutations. Rendering lives in
 * `@/components/quiz/builder/*`.
 *
 * Backend contract is unchanged: `save_quiz_definition` remains the single
 * source of truth, `_expected_version` carries optimistic concurrency, folder
 * placement stays a separate non-destructive `moveContentItem` call, and a
 * locked quiz still sends the reduced payload the server accepts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Loader2, Save, Send } from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { TenantEmptyState } from "@/components/common/TenantGate";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchManagerContentTree,
  folderKeys,
  moveContentItem,
} from "@/lib/contentFolders";
import {
  duplicateQuizAsDraft,
  getQuizDefinitionForManager,
  mapQuizError,
  quizManagerKeys,
  saveQuizDefinition,
  type QuestionType,
} from "@/lib/quizzes";
import {
  BuilderFooter,
  BuilderShell,
  BuilderStepper,
} from "@/components/quiz/builder/QuizBuilderChrome";
import { BasicInfoStep } from "@/components/quiz/builder/BasicInfoStep";
import { QuestionsStep } from "@/components/quiz/builder/QuestionsStep";
import { SettingsStep } from "@/components/quiz/builder/SettingsStep";
import { PreviewStep } from "@/components/quiz/builder/PreviewStep";
import {
  BUILDER_STEPS,
  emptyBuilderState,
  invalidQuestionIndexes,
  isBuilderStep,
  newOption,
  newQuestion,
  rid,
  stateFromDefinition,
  toRpcDefinition,
  validateBuilder,
  validateBuilderIssues,
  type BuilderState,
  type BuilderStep,
  type MetaDraft,
  type OptionDraft,
  type QuestionDraft,
} from "@/components/quiz/builder/types";

type Variant = "tutor" | "admin";

interface Props {
  variant: Variant;
}

export function ClassQuizBuilder({ variant }: Props) {
  const params = useParams<{ classId: string; quizId?: string }>();
  const classId = params.classId!;
  const quizId = params.quizId ?? null;
  const isNew = !quizId;

  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const managerPath = `${basePath}/quizzes`;
  const materialsPath = `${basePath}/resources`;
  const canManage = !!ctx.data?.canManage;

  // ── Load definition ───────────────────────────────────────────────
  const defQ = useQuery({
    queryKey: quizManagerKeys.definition(currentTenantId, classId, quizId ?? "new", user?.id),
    enabled: !isNew && !!user && canManage,
    queryFn: () => getQuizDefinitionForManager(quizId!),
    staleTime: 15_000,
  });

  const [state, setState] = useState<BuilderState>(() => emptyBuilderState());
  const [initialized, setInitialized] = useState(isNew);
  const [dirty, setDirty] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Wizard step (URL-driven, so refresh and Back behave) ──────────
  const stepParam = searchParams.get("step");
  const step: BuilderStep = isBuilderStep(stepParam) ? stepParam : "basic";
  const [furthestStep, setFurthestStep] = useState<BuilderStep>(step);

  useEffect(() => {
    if (BUILDER_STEPS.indexOf(step) > BUILDER_STEPS.indexOf(furthestStep)) {
      setFurthestStep(step);
    }
  }, [step, furthestStep]);

  const goToStep = useCallback(
    (next: BuilderStep, opts?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("step", next);
          return p;
        },
        { replace: opts?.replace ?? false },
      );
      // Each step is a distinct screen on mobile — start it at the top.
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
    },
    [setSearchParams],
  );

  // Normalise a missing/invalid ?step= into the canonical first step.
  useEffect(() => {
    if (!isBuilderStep(stepParam)) goToStep("basic", { replace: true });
  }, [stepParam, goToStep]);

  const [activeQuestion, setActiveQuestion] = useState(0);

  // ── Folder placement (separate from quiz-definition persistence) ──
  const treeQ = useQuery({
    queryKey: folderKeys.managerTree(currentTenantId, classId, user?.id),
    enabled: !!classId && !!user && canManage,
    queryFn: () => fetchManagerContentTree(classId),
    staleTime: 15_000,
  });
  const folders = treeQ.data?.folders ?? [];
  const persistedFolderId = useMemo(() => {
    if (!quizId) return null;
    const row = (treeQ.data?.quizzes ?? []).find((q) => q.id === quizId);
    return row?.folder_id ?? null;
  }, [treeQ.data, quizId]);
  const [folderId, setFolderId] = useState<string | null>(searchParams.get("folder"));
  const folderSeededRef = useRef(false);
  useEffect(() => {
    if (isNew || folderSeededRef.current || !treeQ.data) return;
    folderSeededRef.current = true;
    setFolderId(persistedFolderId);
  }, [isNew, treeQ.data, persistedFolderId]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const restoredDraftRef = useRef(false);

  const locked = !!defQ.data?.locked;
  const hasAttempts = !!defQ.data?.has_attempts;

  // Optimistic concurrency: the version we believe the server holds. The server
  // rejects the save with `quiz_definition_conflict` if it has moved on.
  //
  // A save returns the new definition_version immediately, but the definition
  // query is only invalidated — until that refetch lands the cache still holds
  // the pre-save version. Reading the version from the cache there would reject
  // the tutor's own next save as somebody else's edit, so the acknowledged
  // version wins until the refetch catches up with it.
  const [ackedVersion, setAckedVersion] = useState<number | null>(null);
  const loadedVersion = defQ.data?.quiz.definition_version ?? null;
  const expectedVersion = ackedVersion ?? loadedVersion;

  useEffect(() => {
    if (ackedVersion !== null && loadedVersion !== null && loadedVersion >= ackedVersion) {
      setAckedVersion(null);
    }
  }, [loadedVersion, ackedVersion]);

  const draftKey = useMemo(() => {
    if (!user?.id || !currentTenantId) return null;
    return `quiz-builder:${user.id}:${currentTenantId}:${classId}:${quizId ?? "new"}:${variant}`;
  }, [user?.id, currentTenantId, classId, quizId, variant]);

  // Init from server data (or new)
  useEffect(() => {
    if (initialized) return;
    if (isNew) {
      setState(emptyBuilderState());
      setInitialized(true);
      return;
    }
    if (defQ.data) {
      setState(stateFromDefinition(defQ.data));
      setInitialized(true);
    }
  }, [defQ.data, initialized, isNew]);

  // Restore local draft after init
  useEffect(() => {
    if (!initialized || restoredDraftRef.current || !draftKey) return;
    restoredDraftRef.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) setRestoreOpen(true);
    } catch { /* ignore */ }
  }, [initialized, draftKey]);

  // Persist draft (debounced). Format unchanged, so drafts saved by the
  // previous builder still restore.
  useEffect(() => {
    if (!draftKey || !initialized || !dirty) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(state));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [state, dirty, draftKey, initialized]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as BuilderState;
        // Tolerate drafts written before this refactor.
        if (parsed && typeof parsed === "object" && parsed.meta) {
          setState({ meta: parsed.meta, questions: parsed.questions ?? [] });
          setDirty(true);
        }
      }
    } catch { /* ignore */ }
    setRestoreOpen(false);
  }, [draftKey]);

  const discardDraft = useCallback(() => {
    clearDraft();
    setRestoreOpen(false);
  }, [clearDraft]);

  // ── Validation ────────────────────────────────────────────────────
  const clientIssues = useMemo(() => validateBuilderIssues(state, false), [state]);
  const publishIssues = useMemo(() => validateBuilderIssues(state, true), [state]);
  const clientErrors = useMemo(() => clientIssues.map((i) => i.message), [clientIssues]);
  const publishErrors = useMemo(() => publishIssues.map((i) => i.message), [publishIssues]);
  const invalidIndexes = useMemo(() => invalidQuestionIndexes(state), [state]);

  /** Field keys failing validation, for the step currently shown. */
  const invalidFieldsFor = useCallback(
    (target: BuilderStep) => {
      const set = new Set<string>();
      for (const issue of clientIssues) {
        if (issue.step === target && issue.field) set.add(issue.field);
      }
      return set;
    },
    [clientIssues],
  );

  /** Send the tutor to the first step that can fix a blocking issue. */
  const routeToFirstIssue = useCallback(
    (issues: typeof publishIssues) => {
      const first = issues[0];
      if (!first) return;
      if (typeof first.questionIndex === "number") setActiveQuestion(first.questionIndex);
      goToStep(first.step);
    },
    [goToStep],
  );

  // ── Mutations ─────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async (args: { publish: boolean }) => {
      const errs = validateBuilder(state, args.publish);
      if (errs.length) throw new Error(errs.join("\n"));
      const res = await saveQuizDefinition({
        classId,
        quizId: quizId,
        definition: toRpcDefinition(state, locked) as unknown as Parameters<typeof saveQuizDefinition>[0]["definition"],
        publish: args.publish,
        expectedVersion,
      });
      // Placement is a separate, non-destructive move — attempts and results
      // are untouched because only `folder_id` changes.
      if (folderId !== persistedFolderId || (isNew && folderId)) {
        await moveContentItem("quiz", res.id, folderId);
      }
      return res;
    },
    onSuccess: async (res, args) => {
      // Carry the server's new version forward so a second save in the same
      // session isn't rejected as a conflict with the tutor's own first save.
      setAckedVersion(res.definition_version ?? null);
      qc.invalidateQueries({ queryKey: quizManagerKeys.list(currentTenantId, classId) });
      qc.invalidateQueries({ queryKey: ["class-context", currentTenantId, classId] });
      qc.invalidateQueries({ queryKey: ["tutor-class-home"] });
      qc.invalidateQueries({ queryKey: ["class-content"] });
      clearDraft();
      toast({
        title: args.publish ? "Quiz published" : "Saved",
        description: args.publish ? "Students can now attempt this quiz." : "Your changes are saved.",
      });
      if (isNew) {
        navigate(`${basePath}/quizzes/${res.id}/edit?step=${step}`, { replace: true });
      } else {
        // Force reload of definition to get canonical server state
        qc.invalidateQueries({
          queryKey: quizManagerKeys.definition(currentTenantId, classId, quizId ?? "", user?.id),
        });
        setInitialized(false); // triggers re-init from fresh data
        setDirty(false);
      }
    },
    onError: (err) => {
      toast({
        title: "Couldn't save",
        description: mapQuizError(err, (err as Error)?.message ?? "Please review and try again."),
        variant: "destructive",
      });
    },
  });

  const dupMut = useMutation({
    mutationFn: () => duplicateQuizAsDraft(quizId!),
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: quizManagerKeys.list(currentTenantId, classId) });
      toast({ title: "Duplicated", description: "Opened editable draft copy." });
      navigate(`${basePath}/quizzes/${newId}/edit`);
    },
    onError: (err) =>
      toast({ title: "Duplicate failed", description: mapQuizError(err), variant: "destructive" }),
  });

  /** Validate first so a blocking issue navigates instead of only toasting. */
  const attemptSave = useCallback(
    (publish: boolean) => {
      const issues = publish ? publishIssues : clientIssues;
      if (issues.length > 0) {
        routeToFirstIssue(issues);
        toast({
          title: publish ? "Can't publish yet" : "Can't save yet",
          description: issues[0].message,
          variant: "destructive",
        });
        return;
      }
      saveMut.mutate({ publish });
    },
    [publishIssues, clientIssues, routeToFirstIssue, saveMut, toast],
  );

  // ── State patches ─────────────────────────────────────────────────
  const patchMeta = useCallback(<K extends keyof MetaDraft>(k: K, v: MetaDraft[K]) => {
    setState((s) => ({ ...s, meta: { ...s.meta, [k]: v } }));
    setDirty(true);
  }, []);

  const patchQuestion = useCallback((idx: number, patch: Partial<QuestionDraft>) => {
    setState((s) => {
      const qs = s.questions.slice();
      qs[idx] = { ...qs[idx], ...patch };
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const patchOption = useCallback((qIdx: number, oIdx: number, patch: Partial<OptionDraft>) => {
    setState((s) => {
      const qs = s.questions.slice();
      const opts = qs[qIdx].options.slice();
      opts[oIdx] = { ...opts[oIdx], ...patch };
      qs[qIdx] = { ...qs[qIdx], options: opts };
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const setCorrect = useCallback((qIdx: number, oIdx: number) => {
    setState((s) => {
      const qs = s.questions.slice();
      const opts = qs[qIdx].options.map((o, i) => ({ ...o, is_correct: i === oIdx }));
      qs[qIdx] = { ...qs[qIdx], options: opts };
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const addOption = useCallback((qIdx: number) => {
    setState((s) => {
      const qs = s.questions.slice();
      qs[qIdx] = { ...qs[qIdx], options: [...qs[qIdx].options, newOption()] };
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const removeOption = useCallback((qIdx: number, oIdx: number) => {
    setState((s) => {
      const qs = s.questions.slice();
      qs[qIdx] = { ...qs[qIdx], options: qs[qIdx].options.filter((_, i) => i !== oIdx) };
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const changeQuestionType = useCallback((qIdx: number, type: QuestionType) => {
    setState((s) => {
      const qs = s.questions.slice();
      const existing = qs[qIdx];
      qs[qIdx] =
        type === "true_false"
          ? {
              ...existing,
              question_type: "true_false",
              options: [newOption("True"), newOption("False")],
            }
          : {
              ...existing,
              question_type: "mcq",
              options: existing.options.length >= 2 ? existing.options : [newOption(), newOption()],
            };
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const addQuestion = useCallback((type: QuestionType) => {
    setState((s) => ({ ...s, questions: [...s.questions, newQuestion(type)] }));
    setDirty(true);
  }, []);

  const removeQuestion = useCallback((idx: number) => {
    setState((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== idx) }));
    setDirty(true);
  }, []);

  const duplicateQuestion = useCallback((idx: number) => {
    setState((s) => {
      const q = s.questions[idx];
      const clone: QuestionDraft = {
        ...q,
        id: rid("q"),
        options: q.options.map((o) => ({ ...o, id: rid("opt") })),
      };
      const qs = s.questions.slice();
      qs.splice(idx + 1, 0, clone);
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  const moveQuestion = useCallback((idx: number, dir: -1 | 1) => {
    setState((s) => {
      const target = idx + dir;
      if (target < 0 || target >= s.questions.length) return s;
      const qs = s.questions.slice();
      const [x] = qs.splice(idx, 1);
      qs.splice(target, 0, x);
      return { ...s, questions: qs };
    });
    setDirty(true);
  }, []);

  // Keep the active question in range after deletes.
  useEffect(() => {
    if (activeQuestion > 0 && activeQuestion >= state.questions.length) {
      setActiveQuestion(Math.max(0, state.questions.length - 1));
    }
  }, [state.questions.length, activeQuestion]);

  // Warn on tab close with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const cancel = () => {
    if (dirty) setCancelOpen(true);
    else navigate(managerPath);
  };

  const breadcrumbs = [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Quizzes", to: managerPath },
    { label: isNew ? "New quiz" : "Edit" },
  ];

  const headerRight = (
    <Button variant="outline" onClick={cancel} className="rounded-full">
      <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to quizzes
    </Button>
  );

  if (ctx.data && !canManage) {
    return (
      <ClassShell
        data={ctx.data}
        isLoading={ctx.isLoading}
        role={variant}
        section="quizzes"
        basePath={basePath}
        materialsPath={materialsPath}
        breadcrumbs={breadcrumbs}
      >
        <TenantEmptyState
          title="Not available"
          body="You don't have permission to manage quizzes for this class."
        />
      </ClassShell>
    );
  }

  const loading = ctx.isLoading || (!isNew && defQ.isLoading) || !initialized;
  const stepIndex = BUILDER_STEPS.indexOf(step);
  const isLastStep = stepIndex === BUILDER_STEPS.length - 1;

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="quizzes"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={breadcrumbs}
      headerRight={headerRight}
      mobileTitle={isNew ? "Create quiz" : "Edit quiz"}
      mobileBackTo={managerPath}
      mobileBackLabel="Quizzes"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading builder…
        </div>
      ) : defQ.error ? (
        <div className="bg-white border border-red-200 rounded-3xl p-6 text-sm text-red-600">
          {mapQuizError(defQ.error)}
        </div>
      ) : (
        <BuilderShell>
          <BuilderStepper current={step} furthest={furthestStep} onSelect={goToStep} />

          {locked && step === "basic" && (
            <div className="mb-4 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <div className="min-w-0 text-[13px] text-amber-900">
                <p className="font-bold">This quiz has student attempts.</p>
                <p className="mt-1 leading-snug">
                  Questions, answers, shuffle, time limit, availability and due date are locked to
                  preserve historical results. You can still edit title, description, instructions,
                  result visibility and increase the attempt limit.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 min-h-[44px] rounded-full bg-white"
                  onClick={() => dupMut.mutate()}
                  disabled={dupMut.isPending}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate as new draft
                </Button>
              </div>
            </div>
          )}

          {step === "basic" && (
            <BasicInfoStep
              meta={state.meta}
              onPatch={patchMeta}
              className_={ctx.data?.klass?.title ?? null}
              subjectName={ctx.data?.klass?.subject?.name ?? null}
              folders={folders}
              folderId={folderId}
              onFolderChange={(next) => {
                setFolderId(next);
                setDirty(true);
              }}
              invalidFields={invalidFieldsFor("basic")}
            />
          )}

          {step === "questions" && (
            <QuestionsStep
              questions={state.questions}
              activeIndex={Math.min(activeQuestion, Math.max(0, state.questions.length - 1))}
              onActiveIndexChange={setActiveQuestion}
              locked={locked}
              invalidIndexes={invalidIndexes}
              onAddQuestion={addQuestion}
              onPatchQuestion={patchQuestion}
              onChangeType={changeQuestionType}
              onRemoveQuestion={removeQuestion}
              onDuplicateQuestion={duplicateQuestion}
              onMoveQuestion={moveQuestion}
              onPatchOption={patchOption}
              onSetCorrect={setCorrect}
              onAddOption={addOption}
              onRemoveOption={removeOption}
            />
          )}

          {step === "settings" && (
            <SettingsStep
              meta={state.meta}
              onPatch={patchMeta}
              locked={locked}
              invalidFields={invalidFieldsFor("settings")}
            />
          )}

          {step === "preview" && (
            <PreviewStep
              state={state}
              publishIssues={publishErrors}
              onGoToQuestions={() => goToStep("questions")}
            />
          )}

          <BuilderFooter>
            <Button
              variant="outline"
              onClick={() => (stepIndex === 0 ? cancel() : goToStep(BUILDER_STEPS[stepIndex - 1]))}
              className="h-12 shrink-0 rounded-full px-4 text-[14px] font-semibold"
            >
              {stepIndex === 0 ? "Cancel" : "Back"}
            </Button>

            <Button
              variant="ghost"
              onClick={() => attemptSave(false)}
              disabled={saveMut.isPending}
              className="h-12 shrink-0 rounded-full px-3 text-[14px] font-semibold text-quiz-accent-strong hover:bg-quiz-tint"
            >
              {saveMut.isPending && !saveMut.variables?.publish ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Save
            </Button>

            {isLastStep ? (
              !locked && (
                <Button
                  onClick={() => attemptSave(true)}
                  disabled={saveMut.isPending || hasAttempts}
                  className="h-12 flex-1 rounded-full bg-gradient-to-r from-quiz-accent to-quiz-accent-strong text-[15px] font-extrabold text-white"
                >
                  {saveMut.isPending && saveMut.variables?.publish ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  Publish quiz
                </Button>
              )
            ) : (
              <Button
                onClick={() => goToStep(BUILDER_STEPS[stepIndex + 1])}
                className="h-12 flex-1 rounded-full bg-quiz-accent text-[15px] font-extrabold text-white hover:bg-quiz-accent-strong"
              >
                Next
              </Button>
            )}
          </BuilderFooter>
        </BuilderShell>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this quiz will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate(managerPath)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore your unsaved quiz changes?</AlertDialogTitle>
            <AlertDialogDescription>
              We found unsaved edits from an earlier session on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardDraft}>Discard draft</AlertDialogCancel>
            <AlertDialogAction onClick={restoreDraft}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClassShell>
  );
}

export default ClassQuizBuilder;
