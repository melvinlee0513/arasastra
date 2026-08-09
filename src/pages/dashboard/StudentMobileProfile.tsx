import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Pencil, LogOut, HelpCircle, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { EditProfileSheet } from "@/components/profile/EditProfileSheet";
import { HomeColorPicker } from "@/components/profile/HomeColorPicker";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  invalidateProfileSurfaces,
  useStudentProfile,
  bestStudentName,
} from "@/lib/studentProfile";

/**
 * Student mobile Profile — a compact identity summary plus lightweight
 * preferences. Editing lives in a bottom sheet; subscription, payment and
 * self-enrolment UI are intentionally absent (centres handle those).
 */
export function StudentMobileProfile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useStudentProfile();
  const [editOpen, setEditOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out", description: "You have been successfully signed out." });
    navigate("/");
  };

  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMM yyyy")
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6 pb-4">
        <h1 className="text-[22px] font-bold text-slate-900">Profile</h1>

        {isLoading || !profile ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <Button
              size="sm"
              variant="outline"
              aria-label="Edit profile"
              onClick={() => setEditOpen(true)}
              className="absolute right-3 top-3 h-8 rounded-full px-3 text-[12.5px]"
            >
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Edit
            </Button>
            <div className="flex items-start gap-4 pr-16">
              <UserAvatar
                path={profile.avatar_path}
                name={bestStudentName(profile)}
                refreshKey={profile.avatar_updated_at}
                className="h-16 w-16 ring-2 ring-slate-200"
                fallbackClassName="text-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-slate-900">
                  {bestStudentName(profile)}
                </p>
                <p className="truncate text-[13px] text-slate-500">{user?.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {profile.form_year && (
                    <Badge variant="secondary" className="text-[11.5px]">
                      {profile.form_year}
                    </Badge>
                  )}
                  {memberSince && (
                    <Badge variant="outline" className="text-[11.5px]">
                      Member since {memberSince}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <HomeColorPicker value={profile?.home_header_color} />

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-slate-900">Account</h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => navigate("/dashboard/more")}
              className="flex w-full items-center justify-between p-4 text-left active:bg-slate-50"
            >
              <span className="flex items-center gap-3 text-[14px] font-medium text-slate-900">
                <HelpCircle className="h-5 w-5 text-slate-400" aria-hidden="true" /> Help &amp; support
              </span>
              <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-between p-4 text-left text-destructive active:bg-destructive/5"
            >
              <span className="flex items-center gap-3 text-[14px] font-medium">
                <LogOut className="h-5 w-5" aria-hidden="true" /> Sign out
              </span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </section>

        <p className="pt-2 text-center text-[11.5px] text-slate-400">Arasa A+ v1.0.0</p>
      </div>

      {profile && (
        <EditProfileSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
          email={user?.email ?? null}
          onSaved={() => invalidateProfileSurfaces(qc, user?.id)}
        />
      )}
    </div>
  );
}

export default StudentMobileProfile;
