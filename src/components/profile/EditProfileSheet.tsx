import { useCallback, useState } from "react";
import { AlertCircle, Save } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProfileEditor, type ProfileEditorState } from "@/components/profile/ProfileEditor";
import { useHideBottomNav } from "@/lib/uiChrome";
import type { StudentProfileRecord } from "@/lib/studentProfile";

interface EditProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: StudentProfileRecord;
  email: string | null;
  onSaved: () => void;
}

const INITIAL_STATE: ProfileEditorState = {
  dirty: false,
  isSaving: false,
  canSave: false,
  save: () => {},
};

/**
 * Mobile-first Edit Profile bottom sheet.
 *
 * The sheet owns the scroll area and a sticky, safe-area-aware action footer so
 * "Save changes" is always reachable; the floating student tab bar is suppressed
 * while the sheet is open so it can never overlap those actions.
 */
export function EditProfileSheet({
  open,
  onOpenChange,
  profile,
  email,
  onSaved,
}: EditProfileSheetProps) {
  const [state, setState] = useState<ProfileEditorState>(INITIAL_STATE);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useHideBottomNav(open);

  const handleStateChange = useCallback((next: ProfileEditorState) => setState(next), []);

  const requestClose = () => {
    if (state.dirty && !state.isSaving) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  };

  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <ProfileEditor
          embedded
          hideActions
          onStateChange={handleStateChange}
          profile={{
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name,
            display_name: profile.display_name,
            bio: profile.bio,
            avatar_path: profile.avatar_path,
            avatar_updated_at: profile.avatar_updated_at,
            center_id: profile.center_id,
            email,
          }}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
        {state.dirty && (
          <p className="mb-2 inline-flex items-center gap-1 text-[12px] text-amber-700">
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Unsaved changes
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="min-h-[44px] flex-1 rounded-full"
            onClick={requestClose}
            disabled={state.isSaving}
          >
            Cancel
          </Button>
          <Button
            className="min-h-[44px] flex-1 rounded-full"
            onClick={() => state.save()}
            disabled={!state.canSave}
          >
            <Save className="mr-1 h-4 w-4" aria-hidden="true" />
            {state.isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {isMobile ? (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (next) onOpenChange(true);
            else requestClose();
          }}
        >
          <SheetContent
            side="bottom"
            onInteractOutside={(e) => e.preventDefault()}
            className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 rounded-t-3xl p-0"
          >
            <SheetHeader className="shrink-0 border-b border-border px-4 py-4 text-left">
              <SheetTitle className="text-[17px]">Edit profile</SheetTitle>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        /* Desktop keeps the same editor in a compact centred dialog instead of a
           full-width bottom sheet, which looked broken on wide screens. */
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next) onOpenChange(true);
            else requestClose();
          }}
        >
          <DialogContent
            onInteractOutside={(e) => e.preventDefault()}
            className="flex max-h-[86dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[560px]"
          >
            <DialogHeader className="shrink-0 border-b border-border px-6 py-4 text-left">
              <DialogTitle className="text-[18px]">Edit profile</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}


      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent className="max-w-[320px] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved profile edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-full">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default EditProfileSheet;
