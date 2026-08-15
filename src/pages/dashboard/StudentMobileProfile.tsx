import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { EditProfileSheet } from "@/components/profile/EditProfileSheet";
import { HomeColorPicker } from "@/components/profile/HomeColorPicker";
import {
  AccountActionRow,
  PROFILE_CARD,
  ProfileDecor,
  ProfileFooterDecor,
  ProfileHeader,
  ProfileMetaChip,
  ProfilePage,
  ProfileSectionCard,
} from "@/components/profile/ProfileChrome";
import { PROFILE_ART } from "@/lib/studentIllustrations";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  invalidateProfileSurfaces,
  useStudentProfile,
  bestStudentName,
} from "@/lib/studentProfile";
import { cn } from "@/lib/utils";

/**
 * Student mobile Profile — premium playful identity hero plus lightweight
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


  return (
    <ProfilePage>
      <ProfileHeader title="Profile" subtitle="Manage your learning account" />

      <div className="space-y-5">
        {isLoading || !profile ? (
          <div className={cn("p-5", PROFILE_CARD)}>
            <div className="flex items-center gap-4">
              <Skeleton className="h-[100px] w-[100px] rounded-full" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-7 w-28 rounded-full" />
              </div>
            </div>
          </div>
        ) : (
          <section
            className={cn(
              "relative overflow-hidden bg-[linear-gradient(135deg,#ffffff_0%,#fbfcff_55%,#f3f7ff_100%)] p-4 pb-5 sm:p-5",
              PROFILE_CARD,
            )}
          >
            {/* One completed decorative composition, anchored to the lower-right edge. */}
            <ProfileDecor
              src={PROFILE_ART.cardTile}
              className="absolute -bottom-2 -right-3 h-[112px] w-[168px] opacity-95 sm:h-[128px] sm:w-[192px]"
            />

            <div className="relative flex items-start gap-4">
              <div className="relative shrink-0">
                <div className="rounded-full bg-white p-1.5 shadow-[0_8px_22px_rgba(15,23,42,0.10)] ring-1 ring-sky-100">
                  <UserAvatar
                    path={profile.avatar_path}
                    name={bestStudentName(profile)}
                    refreshKey={profile.avatar_updated_at}
                    className="h-[88px] w-[88px] sm:h-[104px] sm:w-[104px]"
                    fallbackClassName="text-2xl"
                  />
                </div>
                <ProfileDecor
                  src={PROFILE_ART.starBadge}
                  className="absolute -bottom-1 -right-1 h-10 w-10 drop-shadow-[0_3px_8px_rgba(15,23,42,0.2)] sm:h-11 sm:w-11"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 truncate text-[22px] font-extrabold leading-tight tracking-[-0.025em] text-[#0F172A] sm:text-[25px]">
                    {bestStudentName(profile)}
                  </h2>
                  <button
                    type="button"
                    aria-label="Edit profile"
                    onClick={() => setEditOpen(true)}
                    className={cn(
                      "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-sky-100 bg-white px-3.5",
                      "text-[14.5px] font-bold text-primary shadow-[0_5px_16px_rgba(15,23,42,0.10)]",
                      "transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.97]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100",
                    )}
                  >
                    <img
                      src={PROFILE_ART.editPencil}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="pointer-events-none h-[18px] w-[18px] object-contain"
                    />
                    Edit
                  </button>
                </div>

                <p className="mt-1 truncate text-[14px] text-slate-500">{user?.email}</p>

                {profile.form_year && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ProfileMetaChip art={PROFILE_ART.graduationCap}>
                      {profile.form_year}
                    </ProfileMetaChip>
                  </div>
                )}

              </div>
            </div>
          </section>
        )}

        <HomeColorPicker value={profile?.home_header_color} />

        <ProfileSectionCard art={PROFILE_ART.userBadge} title="Account">
          <div className="divide-y divide-sky-50">
            <AccountActionRow
              art={PROFILE_ART.helpBadge}
              label="Help & support"
              onClick={() => navigate("/dashboard/more")}
              trailing={
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              }
            />
            <AccountActionRow
              art={PROFILE_ART.signOut}
              label="Sign out"
              destructive
              onClick={handleSignOut}
              trailing={
                <ChevronRight className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              }
            />
          </div>
        </ProfileSectionCard>
      </div>

      <ProfileFooterDecor version="Aras A+ v1.0.0" />

      {profile && (
        <EditProfileSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
          email={user?.email ?? null}
          onSaved={() => invalidateProfileSurfaces(qc, user?.id)}
        />
      )}
    </ProfilePage>
  );
}

export default StudentMobileProfile;
