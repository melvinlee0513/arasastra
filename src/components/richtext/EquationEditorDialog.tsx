import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MathView } from "./MathView";

interface EquationSnippet {
  label: string;
  /** LaTeX inserted at the cursor. `#` marks where the caret should land. */
  latex: string;
}

const CATEGORIES: Array<{ id: string; label: string; items: EquationSnippet[] }> = [
  {
    id: "basic",
    label: "Basic",
    items: [
      { label: "+", latex: "+" },
      { label: "−", latex: "-" },
      { label: "×", latex: "\\times " },
      { label: "÷", latex: "\\div " },
      { label: "=", latex: "=" },
      { label: "≠", latex: "\\neq " },
      { label: "<", latex: "<" },
      { label: ">", latex: ">" },
      { label: "≤", latex: "\\le " },
      { label: "≥", latex: "\\ge " },
      { label: "±", latex: "\\pm " },
      { label: "( )", latex: "\\left(#\\right)" },
    ],
  },
  {
    id: "fractions",
    label: "Fractions",
    items: [
      { label: "a/b", latex: "\\frac{#}{b}" },
      { label: "dy/dx", latex: "\\frac{dy}{dx}" },
      { label: "∂/∂x", latex: "\\frac{\\partial #}{\\partial x}" },
      { label: "nested", latex: "\\frac{\\frac{#}{b}}{c}" },
    ],
  },
  {
    id: "powers",
    label: "Powers",
    items: [
      { label: "x²", latex: "x^{2}" },
      { label: "x³", latex: "x^{3}" },
      { label: "xⁿ", latex: "#^{n}" },
      { label: "xᵢ", latex: "#_{i}" },
      { label: "10ⁿ", latex: "10^{#}" },
      { label: "eˣ", latex: "e^{#}" },
    ],
  },
  {
    id: "roots",
    label: "Roots",
    items: [
      { label: "√x", latex: "\\sqrt{#}" },
      { label: "ⁿ√x", latex: "\\sqrt[n]{#}" },
      { label: "|x|", latex: "\\left|#\\right|" },
    ],
  },
  {
    id: "functions",
    label: "Functions",
    items: [
      { label: "sin", latex: "\\sin(#)" },
      { label: "cos", latex: "\\cos(#)" },
      { label: "tan", latex: "\\tan(#)" },
      { label: "log", latex: "\\log(#)" },
      { label: "log₁₀", latex: "\\log_{10}(#)" },
      { label: "ln", latex: "\\ln(#)" },
      { label: "exp", latex: "\\exp(#)" },
    ],
  },
  {
    id: "greek",
    label: "Greek",
    items: [
      { label: "α", latex: "\\alpha " },
      { label: "β", latex: "\\beta " },
      { label: "γ", latex: "\\gamma " },
      { label: "Δ", latex: "\\Delta " },
      { label: "θ", latex: "\\theta " },
      { label: "λ", latex: "\\lambda " },
      { label: "μ", latex: "\\mu " },
      { label: "π", latex: "\\pi " },
      { label: "ρ", latex: "\\rho " },
      { label: "Σ", latex: "\\Sigma " },
      { label: "φ", latex: "\\phi " },
      { label: "Ω", latex: "\\Omega " },
    ],
  },
  {
    id: "calculus",
    label: "Calculus",
    items: [
      { label: "Σ", latex: "\\sum_{i=1}^{n} #" },
      { label: "∏", latex: "\\prod_{i=1}^{n} #" },
      { label: "∫", latex: "\\int #\\,dx" },
      { label: "∫ₐᵇ", latex: "\\int_{a}^{b} #\\,dx" },
      { label: "lim", latex: "\\lim_{x \\to #}" },
      { label: "∞", latex: "\\infty " },
    ],
  },
  {
    id: "matrices",
    label: "Matrices",
    items: [
      { label: "2×2", latex: "\\begin{pmatrix} # & b \\\\ c & d \\end{pmatrix}" },
      { label: "2×1", latex: "\\begin{pmatrix} # \\\\ b \\end{pmatrix}" },
      { label: "cases", latex: "\\begin{cases} # & x > 0 \\\\ b & x \\le 0 \\end{cases}" },
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    items: [
      { label: "°", latex: "^{\\circ}" },
      { label: "→", latex: "\\rightarrow " },
      { label: "⇌", latex: "\\rightleftharpoons " },
      { label: "≈", latex: "\\approx " },
      { label: "∴", latex: "\\therefore " },
      { label: "∈", latex: "\\in " },
      { label: "%", latex: "\\%" },
      { label: "·", latex: "\\cdot " },
    ],
  },
];

interface EquationEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLatex?: string;
  initialDisplay?: boolean;
  onSubmit: (latex: string, display: boolean) => void;
}

/**
 * Visual-first equation editor: tutors build maths from labelled buttons and
 * see a live preview; the LaTeX source stays editable for advanced users.
 */
export function EquationEditorDialog({
  open,
  onOpenChange,
  initialLatex = "",
  initialDisplay = false,
  onSubmit,
}: EquationEditorDialogProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [display, setDisplay] = useState(initialDisplay);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setLatex(initialLatex);
      setDisplay(initialDisplay);
    }
  }, [open, initialLatex, initialDisplay]);

  const insert = (snippet: string) => {
    const el = textareaRef.current;
    const caretMarker = snippet.indexOf("#");
    const clean = snippet.replace("#", "");
    const start = el?.selectionStart ?? latex.length;
    const end = el?.selectionEnd ?? latex.length;
    const next = latex.slice(0, start) + clean + latex.slice(end);
    setLatex(next);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      const caret = start + (caretMarker >= 0 ? caretMarker : clean.length);
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  };

  const canInsert = latex.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>Equation editor</DialogTitle>
        </DialogHeader>

        <div className="rounded-2xl border bg-muted/40 p-4 min-h-[76px] flex items-center justify-center overflow-x-auto">
          {canInsert ? (
            <MathView latex={latex} display={display} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a symbol below to start building.</p>
          )}
        </div>

        <Tabs defaultValue="basic">
          <ScrollArea className="w-full">
            <TabsList className="w-max">
              {CATEGORIES.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>
          {CATEGORIES.map((cat) => (
            <TabsContent key={cat.id} value={cat.id} className="mt-3">
              <div className="grid grid-cols-4 gap-2">
                {cat.items.map((item) => (
                  <Button
                    key={`${cat.id}-${item.label}`}
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl text-sm"
                    onClick={() => insert(item.latex)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="equation-latex" className="text-xs uppercase tracking-wide text-muted-foreground">
            LaTeX source (optional)
          </Label>
          <Textarea
            id="equation-latex"
            ref={textareaRef}
            value={latex}
            onChange={(event) => setLatex(event.target.value)}
            rows={3}
            className="font-mono text-sm rounded-xl"
            placeholder="E = mc^{2}"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={display ? "outline" : "default"}
            className="rounded-full"
            onClick={() => setDisplay(false)}
          >
            Inline
          </Button>
          <Button
            type="button"
            size="sm"
            variant={display ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setDisplay(true)}
          >
            Block
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canInsert}
            onClick={() => {
              onSubmit(latex.trim(), display);
              onOpenChange(false);
            }}
          >
            Insert equation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
