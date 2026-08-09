import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import type { StudentProfileRecord } from "@/lib/studentProfile";

interface EditProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: StudentProfileRecord;
  email: string | null;
  onSaved: () => void;
}

/**
 * Mobile-first Edit Profile bottom sheet. Wraps the existing ProfileEditor so
 * avatar upload, display name and About Me keep their validation and secure
 * storage pipeline — only the presentation moves off the Profile page.
 */
export function EditProfileSheet({
  open,
  onOpenChange,
  profile,
  email,
  onSaved,
}: EditProfileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-[17px]">Edit profile</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <ProfileEditor
            embedded
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
      </SheetContent>
    </Sheet>
  );
}

export default EditProfileSheet;
