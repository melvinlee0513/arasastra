import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { CreateTenantModal } from "@/components/admin/CreateTenantModal";

/**
 * TenantSwitcher — visible to superadmins only. Impersonates another tuition
 * centre for support without a full page reload; downstream queries are
 * invalidated automatically by TenantProvider.
 */
export function TenantSwitcher({ className }: { className?: string }) {
  const { center, availableCenters, isSuperAdmin, setCurrentTenantId } = useTenant();
  const [createOpen, setCreateOpen] = useState(false);

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
        {availableCenters.map((c) => {
          const active = c.id === center.id;
          return (
            <DropdownMenuItem
              key={c.id}
              onSelect={() => setCurrentTenantId(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-full p-2 my-0.5 cursor-pointer",
                active && "bg-[#0052FF]/10 text-[#0052FF] focus:bg-[#0052FF]/15",
              )}
            >
              {c.logoUrl ? (
                <img
                  src={c.logoUrl}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center",
                  active ? "bg-[#0052FF]/15" : "bg-slate-100",
                )}>
                  <Building2 className={cn("h-4 w-4", active ? "text-[#0052FF]" : "text-slate-400")} />
                </div>
              )}
              <div className="flex-1 text-sm">
                <div className={cn("font-medium", active ? "text-[#0052FF]" : "text-slate-900")}>
                  {c.name}
                </div>
              </div>
              {active && <Check className="h-4 w-4 text-[#0052FF]" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
