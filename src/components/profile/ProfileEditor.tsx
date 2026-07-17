import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Save, Trash2, X, AlertCircle, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/profile/UserAvatar";
import {
  AVATAR_BUCKET, avatarPathFor, invalidateAvatarCache, processAvatarFile,
} from "@/lib/profile";
import { toSafeMessage } from "@/components/common/TenantGate";

const DISPLAY_STORAGE_KEY = (uid: string) => `profile-draft:${uid}`;

type ProfileExt = {
  id: string;
  user_id: string;
  full_name: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_path?: string | null;
  avatar_updated_at?: string | null;
  center_id: string | null;
  email?: string | null;
};

export function ProfileEditor({
  profile, onSaved,
}: { profile: ProfileExt; onSaved?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id || profile.user_id;

  const [displayName, setDisplayName] = useState<string>(profile.display_name || "");
  const [bio, setBio] = useState<string>(profile.bio || "");
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore unfinished draft (per user)
  useEffect(() => {
    if (!uid) return;
    try {
      const raw = sessionStorage.getItem(DISPLAY_STORAGE_KEY(uid));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { displayName?: string; bio?: string };
      if (parsed.displayName && !profile.display_name) setDisplayName(parsed.displayName);
      if (parsed.bio && !profile.bio) setBio(parsed.bio);
    } catch { /* ignore */ }
    // Intentionally only run once on mount for this user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Persist unfinished edits
  useEffect(() => {
    if (!uid) return;
    const dirty = displayName !== (profile.display_name || "") || bio !== (profile.bio || "");
    if (dirty) {
      sessionStorage.setItem(DISPLAY_STORAGE_KEY(uid), JSON.stringify({ displayName, bio }));
    } else {
      sessionStorage.removeItem(DISPLAY_STORAGE_KEY(uid));
    }
  }, [displayName, bio, uid, profile.display_name, profile.bio]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const trimmedName = displayName.trim();
  const nameError =
    trimmedName.length > 0 && (trimmedName.length < 2 || trimmedName.length > 50)
      ? "Display name must be 2–50 characters."
      : /[\p{Cc}]/u.test(trimmedName) ? "Display name has invalid characters." : null;
  const bioError = bio.length > 300 ? "Bio must be 300 characters or fewer." : null;

  const dirty = trimmedName !== (profile.display_name || "") || bio !== (profile.bio || "") || !!file;

  const handleFile = async (raw: File) => {
    try {
      const processed = await processAvatarFile(raw);
      setFile(processed);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(processed));
    } catch (e) {
      toast.error(toSafeMessage(e, "Couldn't use that image."));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user || !profile.center_id) throw new Error("Sign in required.");
      if (nameError) throw new Error(nameError);
      if (bioError) throw new Error(bioError);

      let avatarPath: string | undefined;
      if (file) {
        const path = avatarPathFor(profile.center_id, user.id);
        const { error: upErr } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, file, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
        if (upErr) throw upErr;
        avatarPath = path;
        invalidateAvatarCache(path);
      }

      const patch: Record<string, unknown> = {
        display_name: trimmedName.length ? trimmedName : null,
        bio: bio.trim().length ? bio.trim() : null,
      };
      if (avatarPath) patch.avatar_path = avatarPath;

      const { error } = await supabase.from("profiles").update(patch).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      if (uid) sessionStorage.removeItem(DISPLAY_STORAGE_KEY(uid));
      setFile(null);
      if (preview) { URL.revokeObjectURL(preview); setPreview(null); }
      qc.invalidateQueries({ queryKey: ["avatar-url"] });
      onSaved?.();
    },
    onError: (e) => toast.error(toSafeMessage(e, "Couldn't save your profile.")),
  });

  const removeAvatarMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required.");
      if (profile.avatar_path) {
        const { error: delErr } = await supabase.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
        if (delErr) throw delErr;
        invalidateAvatarCache(profile.avatar_path);
      }
      const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile picture removed");
      qc.invalidateQueries({ queryKey: ["avatar-url"] });
      onSaved?.();
    },
    onError: (e) => toast.error(toSafeMessage(e, "Couldn't remove your picture.")),
  });

  return (
    <Card className="p-5 sm:p-6 bg-card border border-border space-y-5">
      <div className="flex items-start gap-4">
        <div className="relative">
          <UserAvatar
            path={preview ? null : profile.avatar_path}
            name={trimmedName || profile.full_name}
            className="w-20 h-20 border-4 border-accent/20"
            fallbackClassName="text-2xl"
            refreshKey={profile.avatar_updated_at}
          />
          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="absolute inset-0 w-20 h-20 rounded-full object-cover border-4 border-primary/40"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{profile.full_name}</p>
          <p className="text-sm text-muted-foreground truncate">{profile.email || "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">Only you and centre admins can see your email.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="rounded-full">
              <Camera className="w-3.5 h-3.5 mr-1" /> {profile.avatar_path || preview ? "Change" : "Upload"} picture
            </Button>
            {preview && (
              <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground"
                onClick={() => { if (preview) URL.revokeObjectURL(preview); setPreview(null); setFile(null); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel image
              </Button>
            )}
            {profile.avatar_path && !preview && (
              <Button size="sm" variant="ghost" className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => removeAvatarMut.mutate()} disabled={removeAvatarMut.isPending}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove picture
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> JPEG / PNG / WebP, up to 5 MB. Square, ~512px.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={displayName}
            maxLength={50}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you appear to classmates"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className={nameError ? "text-red-600" : "text-muted-foreground"}>
              {nameError || "Shown in class rosters, leaderboards and future discussions."}
            </span>
            <span className="text-muted-foreground">{trimmedName.length}/50</span>
          </div>
        </div>
        <div>
          <Label htmlFor="bio">About me</Label>
          <Textarea
            id="bio"
            value={bio}
            maxLength={300}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short line about yourself (optional)"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className={bioError ? "text-red-600" : "text-muted-foreground"}>
              {bioError || "Plain text only. No HTML."}
            </span>
            <span className="text-muted-foreground">{bio.length}/300</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        {dirty ? (
          <p className="text-xs text-amber-700 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Unsaved changes
          </p>
        ) : <span />}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || saveMut.isPending}
            onClick={() => {
              setDisplayName(profile.display_name || "");
              setBio(profile.bio || "");
              if (preview) URL.revokeObjectURL(preview);
              setPreview(null);
              setFile(null);
              if (uid) sessionStorage.removeItem(DISPLAY_STORAGE_KEY(uid));
            }}
          >
            Reset
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending || !!nameError || !!bioError}>
            <Save className="w-4 h-4 mr-1" /> Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default ProfileEditor;
