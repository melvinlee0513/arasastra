import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { MATH_BLOCK_NODE, MATH_INLINE_NODE } from "@/lib/richContent";
import { MathView } from "./MathView";
import { cn } from "@/lib/utils";

function MathNodeView({ node, selected, editor, getPos }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? "");
  const display = node.type.name === MATH_BLOCK_NODE;

  const handleClick = () => {
    if (typeof getPos === "function") {
      editor.commands.setNodeSelection(getPos());
    }
  };

  return (
    <NodeViewWrapper
      as={display ? "div" : "span"}
      className={cn(
        "cursor-pointer rounded-md px-1 transition-colors",
        display && "block my-2",
        selected ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-primary/5",
      )}
      data-math-latex={latex}
      onClick={handleClick}
    >
      <MathView latex={latex} display={display} />
    </NodeViewWrapper>
  );
}

const mathAttributes = {
  latex: {
    default: "",
    parseHTML: (element: HTMLElement) => element.getAttribute("data-latex") ?? "",
    renderHTML: (attributes: Record<string, unknown>) => ({
      "data-latex": String(attributes.latex ?? ""),
    }),
  },
};

export const MathInline = Node.create({
  name: MATH_INLINE_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return mathAttributes;
  },
  parseHTML() {
    return [{ tag: `span[data-type="${MATH_INLINE_NODE}"]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": MATH_INLINE_NODE })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});

export const MathBlock = Node.create({
  name: MATH_BLOCK_NODE,
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return mathAttributes;
  },
  parseHTML() {
    return [{ tag: `div[data-type="${MATH_BLOCK_NODE}"]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": MATH_BLOCK_NODE })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },
});
