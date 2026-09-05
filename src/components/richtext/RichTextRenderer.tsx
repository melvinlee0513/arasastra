import { Fragment, type ReactNode } from "react";
import {
  MATH_BLOCK_NODE,
  MATH_INLINE_NODE,
  parseRichValue,
  type RichDoc,
  type RichNode,
} from "@/lib/richContent";
import { MathView } from "./MathView";
import { cn } from "@/lib/utils";

interface RichTextRendererProps {
  /** Canonical rich JSON (or legacy plain text / JSON string). */
  value: unknown;
  /** Legacy plain-text mirror used when `value` has no rich content. */
  fallbackText?: string;
  className?: string;
}

function applyMarks(node: RichNode, child: ReactNode): ReactNode {
  let out = child;
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong className="font-semibold">{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "subscript":
        out = <sub>{out}</sub>;
        break;
      case "superscript":
        out = <sup>{out}</sup>;
        break;
      case "code":
        out = <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{out}</code>;
        break;
      default:
        break;
    }
  }
  return out;
}

function renderNodes(nodes: RichNode[] | undefined): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((node, index) => (
    <Fragment key={index}>{renderNode(node)}</Fragment>
  ));
}

function renderNode(node: RichNode): ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node, node.text ?? "");
    case "hardBreak":
      return <br />;
    case "paragraph":
      return <p className="whitespace-pre-wrap break-words">{renderNodes(node.content)}</p>;
    case "heading":
      return <p className="font-semibold">{renderNodes(node.content)}</p>;
    case "bulletList":
      return <ul className="list-disc pl-5 space-y-1">{renderNodes(node.content)}</ul>;
    case "orderedList":
      return <ol className="list-decimal pl-5 space-y-1">{renderNodes(node.content)}</ol>;
    case "listItem":
      return <li>{renderNodes(node.content)}</li>;
    case MATH_INLINE_NODE:
      return <MathView latex={String(node.attrs?.latex ?? "")} />;
    case MATH_BLOCK_NODE:
      return <MathView latex={String(node.attrs?.latex ?? "")} display />;
    default:
      // Unknown node types degrade to their children, never to raw JSON.
      return renderNodes(node.content);
  }
}

/**
 * The single safe renderer for academic rich content — used by tutor previews,
 * student quiz gameplay, quiz results and flashcards.
 */
export function RichTextRenderer({ value, fallbackText = "", className }: RichTextRendererProps) {
  const doc: RichDoc = parseRichValue(value, fallbackText);
  return (
    <div className={cn("space-y-2 text-balance [&_p:empty]:h-3", className)}>
      {renderNodes(doc.content)}
    </div>
  );
}
