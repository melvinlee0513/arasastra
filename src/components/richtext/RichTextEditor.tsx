import { useCallback, useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Eraser,
  Sigma,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MATH_BLOCK_NODE,
  MATH_INLINE_NODE,
  parseRichValue,
  richDocToPlainText,
  type RichDoc,
} from "@/lib/richContent";
import { MathBlock, MathInline } from "./mathExtension";
import { EquationEditorDialog } from "./EquationEditorDialog";
import { SymbolPickerPopover } from "./SymbolPickerPopover";

export interface RichTextEditorProps {
  /** Canonical rich JSON, legacy plain text, or null. */
  value: unknown;
  /** Legacy plain-text mirror used when `value` carries no rich content. */
  fallbackText?: string;
  onChange: (doc: RichDoc, plainText: string) => void;
  placeholder?: string;
  /** Hide list buttons for short single-line fields such as MCQ options. */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ label, active, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("h-9 w-9 rounded-lg", active && "bg-primary/10 text-primary")}
    >
      {children}
    </Button>
  );
}

/**
 * The single Aras A+ academic rich text editor — shared by flashcards, quiz
 * questions, options and explanations. Content is stored as structured JSON
 * (never raw user HTML) with a plain-text mirror for search and legacy fields.
 */
export function RichTextEditor({
  value,
  fallbackText = "",
  onChange,
  placeholder = "Type here…",
  compact = false,
  disabled = false,
  className,
  ariaLabel,
}: RichTextEditorProps) {
  const [equationOpen, setEquationOpen] = useState(false);
  const [equationDraft, setEquationDraft] = useState<{ latex: string; display: boolean }>({
    latex: "",
    display: false,
  });

  const initialDoc = useMemo(() => parseRichValue(value, fallbackText), [value, fallbackText]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
          bulletList: compact ? false : undefined,
          orderedList: compact ? false : undefined,
          listItem: compact ? false : undefined,
        }),
        Underline,
        Subscript,
        Superscript,
        MathInline,
        MathBlock,
      ],
      content: initialDoc,
      editable: !disabled,
      editorProps: {
        attributes: {
          class: cn(
            "min-h-[72px] w-full px-3 py-2 text-sm leading-relaxed focus:outline-none",
            "[&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          ),
          "aria-label": ariaLabel ?? placeholder,
        },
      },
      onUpdate: ({ editor: instance }) => {
        const doc = instance.getJSON() as RichDoc;
        onChange(doc, richDocToPlainText(doc));
      },
    },
    [compact],
  );

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  const openEquationEditor = useCallback((instance: Editor) => {
    const node = instance.state.selection.$from.nodeAfter;
    const selectedName = node?.type.name;
    if (selectedName === MATH_INLINE_NODE || selectedName === MATH_BLOCK_NODE) {
      setEquationDraft({
        latex: String(node?.attrs?.latex ?? ""),
        display: selectedName === MATH_BLOCK_NODE,
      });
    } else {
      setEquationDraft({ latex: "", display: false });
    }
    setEquationOpen(true);
  }, []);

  const insertEquation = useCallback(
    (latex: string, display: boolean) => {
      if (!editor) return;
      const type = display ? MATH_BLOCK_NODE : MATH_INLINE_NODE;
      const node = editor.state.selection.$from.nodeAfter;
      const replacing =
        node?.type.name === MATH_INLINE_NODE || node?.type.name === MATH_BLOCK_NODE;
      const chain = editor.chain().focus();
      if (replacing) chain.deleteSelection();
      chain.insertContent({ type, attrs: { latex } }).run();
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className={cn("rounded-2xl border bg-background", className)}>
        <div className="min-h-[104px] animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  const isEmpty = editor.isEmpty;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-background focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Superscript"
          active={editor.isActive("superscript")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          <SuperscriptIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Subscript"
          active={editor.isActive("subscript")}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          <SubscriptIcon className="h-4 w-4" />
        </ToolbarButton>

        {!compact && (
          <>
            <ToolbarButton
              label="Bulleted list"
              active={editor.isActive("bulletList")}
              disabled={disabled}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              active={editor.isActive("orderedList")}
              disabled={disabled}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-4 w-4" />
            </ToolbarButton>
          </>
        )}

        <SymbolPickerPopover
          disabled={disabled}
          onInsert={(symbol) => editor.chain().focus().insertContent(symbol).run()}
        />

        <ToolbarButton
          label="Insert equation"
          disabled={disabled}
          onClick={() => openEquationEditor(editor)}
        >
          <Sigma className="h-4 w-4" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            label="Undo"
            disabled={disabled || !editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={disabled || !editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Clear formatting"
            disabled={disabled}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            <Eraser className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      <div className="relative">
        {isEmpty && (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>

      <EquationEditorDialog
        open={equationOpen}
        onOpenChange={setEquationOpen}
        initialLatex={equationDraft.latex}
        initialDisplay={equationDraft.display}
        onSubmit={insertEquation}
      />
    </div>
  );
}
