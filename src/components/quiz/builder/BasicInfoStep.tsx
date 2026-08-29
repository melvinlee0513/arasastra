/**
 * Step 1 — Basic Info.
 *
 * Only fields `save_quiz_definition` actually persists. Subject and grade come
 * from the CLASS the quiz already belongs to and are shown as read-only
 * context, never saved onto the quiz — the reference design's Subject / Grade /
 * Topic / Tags / Cover Image controls have no canonical backend home.
 */
import { BookOpen, FolderTree, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FolderSelect } from "@/components/class/FolderSelect";
import type { ContentFolder } from "@/lib/contentFolders";
import { QUIZ_ART } from "@/lib/quizArt";
import {
  BuilderArt,
  BuilderCard,
  BuilderField,
  BuilderPill,
  BuilderSection,
} from "./QuizBuilderChrome";
import type { MetaDraft } from "./types";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 300;
const INSTRUCTIONS_MAX = 1000;

export interface BasicInfoStepProps {
  meta: MetaDraft;
  onPatch: <K extends keyof MetaDraft>(key: K, value: MetaDraft[K]) => void;
  /** Class context shown as read-only provenance. */
  className_: string | null;
  subjectName: string | null;
  folders: ContentFolder[];
  folderId: string | null;
  onFolderChange: (id: string | null) => void;
  /** Field keys currently failing validation. */
  invalidFields: Set<string>;
}

export function BasicInfoStep({
  meta,
  onPatch,
  className_,
  subjectName,
  folders,
  folderId,
  onFolderChange,
  invalidFields,
}: BasicInfoStepProps) {
  return (
    <div className="space-y-4">
      {/* Welcome / context card */}
      <BuilderCard tone="accent" className="relative overflow-hidden">
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold leading-tight text-slate-900">
              Let's build something great
            </h1>
            <p className="mt-1 text-[13px] leading-snug text-slate-600">
              A clear title and description help students know what to expect.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {className_ && (
                <BuilderPill icon={<BookOpen className="h-3 w-3" />} tone="accent">
                  {className_}
                </BuilderPill>
              )}
              {subjectName && <BuilderPill tone="neutral">{subjectName}</BuilderPill>}
            </div>
          </div>
          <BuilderArt
            src={QUIZ_ART.owlController}
            className="h-24 w-24 shrink-0 drop-shadow-[0_12px_20px_rgba(15,23,42,0.18)]"
          />
        </div>
      </BuilderCard>

      <BuilderSection
        title="Quiz details"
        description="Students see this when the quiz is published."
        icon={<Info className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <BuilderField
            label="Quiz title"
            htmlFor="quiz-title"
            required
            hint="Give your quiz a clear, specific title."
            error={invalidFields.has("title") ? "A title is required." : undefined}
          >
            <div className="relative">
              <Input
                id="quiz-title"
                value={meta.title}
                maxLength={TITLE_MAX}
                onChange={(e) => onPatch("title", e.target.value)}
                placeholder="e.g. Chapter 5 — Quadratic Equations"
                className="h-12 rounded-2xl pr-16 text-[15px] bg-white border-slate-200"
                aria-invalid={invalidFields.has("title") || undefined}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-slate-400">
                {meta.title.length}/{TITLE_MAX}
              </span>
            </div>
          </BuilderField>

          <BuilderField
            label="Description"
            htmlFor="quiz-desc"
            hint="A short summary of what this quiz covers."
          >
            <div className="relative">
              <Textarea
                id="quiz-desc"
                value={meta.description}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => onPatch("description", e.target.value)}
                placeholder="Test your understanding of…"
                rows={3}
                className="rounded-2xl pb-7 text-[15px] bg-white border-slate-200"
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] font-medium tabular-nums text-slate-400">
                {meta.description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
          </BuilderField>

          <BuilderField
            label="Instructions"
            htmlFor="quiz-inst"
            hint="Shown before the student starts. Optional."
          >
            <Textarea
              id="quiz-inst"
              value={meta.instructions}
              maxLength={INSTRUCTIONS_MAX}
              onChange={(e) => onPatch("instructions", e.target.value)}
              placeholder="Read each question carefully. You may not go back once submitted."
              rows={3}
              className="rounded-2xl text-[15px] bg-white border-slate-200"
            />
          </BuilderField>
        </div>
      </BuilderSection>

      <BuilderSection
        title="Placement"
        description="Where this quiz appears in your class materials."
        icon={<FolderTree className="h-5 w-5" />}
      >
        <BuilderField
          label="Folder"
          htmlFor="quiz-folder"
          hint="Leave unset to keep the quiz at the top level."
        >
          {/* label="" — BuilderField already renders the label. */}
          <FolderSelect
            id="quiz-folder"
            label=""
            folders={folders}
            value={folderId}
            onChange={onFolderChange}
          />
        </BuilderField>
      </BuilderSection>
    </div>
  );
}

export default BasicInfoStep;
