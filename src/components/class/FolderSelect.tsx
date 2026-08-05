import { Folder, FolderOpen } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { UNFILED_LABEL, moveTargets, type ContentFolder } from "@/lib/contentFolders";

const UNFILED_VALUE = "__unfiled__";

interface Props {
  folders: ContentFolder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  /** Exclude this folder and its descendants (used when moving a folder). */
  excludeFolderId?: string;
  label?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Folder placement selector. Options come from the authorised class content
 * tree only — folders from another class or tenant are never offered, and the
 * server RPCs reject them anyway.
 */
export function FolderSelect({
  folders,
  value,
  onChange,
  excludeFolderId,
  label = "Folder",
  disabled,
  id = "folder-select",
}: Props) {
  const targets = moveTargets(folders, excludeFolderId);

  return (
    <div className="space-y-1.5">
      {label && (
        <Label htmlFor={id} className="text-xs font-medium text-slate-600">
          {label}
        </Label>
      )}
      <Select
        value={value ?? UNFILED_VALUE}
        onValueChange={(v) => onChange(v === UNFILED_VALUE ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="rounded-full">
          <SelectValue placeholder={UNFILED_LABEL} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={UNFILED_VALUE}>
            <span className="inline-flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" /> {UNFILED_LABEL}
            </span>
          </SelectItem>
          {targets.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <span
                className="inline-flex items-center gap-2"
                style={{ paddingLeft: `${t.depth * 12}px` }}
              >
                <Folder className="w-3.5 h-3.5 text-slate-400" /> {t.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
