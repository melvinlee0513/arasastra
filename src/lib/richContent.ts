/**
 * Shared academic rich content model for Aras A+ (quizzes + flashcards).
 *
 * Canonical storage is TipTap/ProseMirror JSON (`RichDoc`) plus a plain-text
 * mirror used for search and legacy consumers. Legacy plain-text records keep
 * working: `parseRichValue` upgrades a bare string into a valid document.
 */

export const RICH_MARKS = [
  "bold",
  "italic",
  "underline",
  "subscript",
  "superscript",
  "code",
] as const;

export type RichMarkName = (typeof RICH_MARKS)[number];

export interface RichMark {
  type: string;
}

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichMark[];
  content?: RichNode[];
}

export interface RichDoc {
  type: "doc";
  content: RichNode[];
}

export const MATH_INLINE_NODE = "mathInline";
export const MATH_BLOCK_NODE = "mathBlock";

/** An empty, valid document. */
export function emptyRichDoc(): RichDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Build a document from plain text (newlines become paragraphs). */
export function plainTextToRichDoc(text: string): RichDoc {
  const lines = (text ?? "").split(/\r?\n/);
  const content: RichNode[] = lines.map((line) =>
    line.length > 0
      ? { type: "paragraph", content: [{ type: "text", text: line }] }
      : { type: "paragraph" },
  );
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

function isRichDoc(value: unknown): value is RichDoc {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/**
 * Normalise whatever the database gave us into a document.
 * Accepts: RichDoc JSON, a JSON string of one, or legacy plain text.
 */
export function parseRichValue(json: unknown, fallbackText = ""): RichDoc {
  if (isRichDoc(json)) return json;

  if (typeof json === "string" && json.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(json);
      if (isRichDoc(parsed)) return parsed;
    } catch {
      // fall through to plain text handling
    }
  }

  if (typeof json === "string" && json.trim().length > 0) {
    return plainTextToRichDoc(json);
  }

  return fallbackText.trim().length > 0 ? plainTextToRichDoc(fallbackText) : emptyRichDoc();
}

/** Flatten a document to plain text; math nodes contribute their LaTeX. */
export function richDocToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc) return "";

  const walk = (nodes: RichNode[] | undefined): string => {
    if (!nodes) return "";
    return nodes
      .map((node) => {
        if (node.type === "text") return node.text ?? "";
        if (node.type === "hardBreak") return "\n";
        if (node.type === MATH_INLINE_NODE || node.type === MATH_BLOCK_NODE) {
          const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
          return latex;
        }
        const inner = walk(node.content);
        const isBlock =
          node.type === "paragraph" ||
          node.type === "listItem" ||
          node.type === "heading" ||
          node.type === MATH_BLOCK_NODE;
        return isBlock ? `${inner}\n` : inner;
      })
      .join("");
  };

  return walk(doc.content).replace(/\n{3,}/g, "\n\n").trim();
}

/** True when the document carries no visible content. */
export function isRichDocEmpty(doc: RichDoc | null | undefined): boolean {
  if (!doc) return true;
  const text = richDocToPlainText(doc);
  if (text.length > 0) return false;
  const hasNode = (nodes: RichNode[] | undefined): boolean =>
    (nodes ?? []).some(
      (n) => n.type === "image" || n.type === MATH_BLOCK_NODE || hasNode(n.content),
    );
  return !hasNode(doc.content);
}

/** Payload shape written to the database for a rich field. */
export interface RichFieldPayload {
  content_json: RichDoc;
  text: string;
}

export function toRichFieldPayload(doc: RichDoc | null | undefined): RichFieldPayload {
  const safeDoc = doc && isRichDoc(doc) ? doc : emptyRichDoc();
  return { content_json: safeDoc, text: richDocToPlainText(safeDoc) };
}

/** Academic symbols offered by the editor's symbol picker. */
export const ACADEMIC_SYMBOL_GROUPS: Array<{ label: string; symbols: string[] }> = [
  { label: "Operators", symbols: ["±", "×", "÷", "≈", "≠", "≤", "≥", "∞", "°", "∓", "·", "√"] },
  { label: "Greek", symbols: ["Δ", "θ", "π", "λ", "μ", "Ω", "α", "β", "γ", "Σ", "φ", "ρ"] },
  { label: "Arrows & sets", symbols: ["→", "←", "↔", "⇒", "⇔", "∈", "∉", "⊂", "∪", "∩", "∴", "∵"] },
];
