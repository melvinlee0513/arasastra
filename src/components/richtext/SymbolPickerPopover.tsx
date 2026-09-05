import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Omega } from "lucide-react";
import { ACADEMIC_SYMBOL_GROUPS } from "@/lib/richContent";

interface SymbolPickerPopoverProps {
  onInsert: (symbol: string) => void;
  disabled?: boolean;
}

/** Mobile-friendly academic symbol picker used by the rich text toolbar. */
export function SymbolPickerPopover({ onInsert, disabled }: SymbolPickerPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg"
          disabled={disabled}
          aria-label="Insert symbol"
        >
          <Omega className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] space-y-3 rounded-2xl">
        {ACADEMIC_SYMBOL_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {group.symbols.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => onInsert(symbol)}
                  className="h-9 rounded-lg border bg-background text-base hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Insert ${symbol}`}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
