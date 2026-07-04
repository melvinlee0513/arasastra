import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * TenantSwitcher — visible to superadmins only. Impersonates another tuition
 * centre for support without a full page reload; downstream queries are
 * invalidated automatically by TenantProvider.
 */
export function TenantSwitcher({ className }: { className?: string }) {
  const { center, availableCenters, isSuperAdmin, setCurrentTenantId } = useTenant();

  if (!isSuperAdmin || !center) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 gap-2 rounded-full border-slate-200 bg-white/80 px-4 backdrop-blur-md",
            "shadow-sm hover:bg-white",
            className,
          )}
        >
          <Building2 className="h-4 w-4 text-[#0052FF]" />
          <span className="max-w-[160px] truncate text-sm font-medium text-slate-900">
            {center.name}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl border-slate-200 p-2">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-slate-500">
          Impersonate centre
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableCenters.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => setCurrentTenantId(c.id)}
            className="flex items-center gap-2 rounded-xl p-2"
          >
            <img
              src={c.logoUrl}
              alt=""
              className="h-8 w-8 rounded-lg object-cover"
            />
            <div className="flex-1 text-sm">
              <div className="font-medium text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-500">{c.slug}</div>
            </div>
            {c.id === center.id && (
              <Check className="h-4 w-4 text-[#0052FF]" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
