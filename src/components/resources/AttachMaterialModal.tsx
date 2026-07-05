import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// TODO: Replace with the tenant's Google Cloud OAuth clientId + API key
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const GOOGLE_DEVELOPER_KEY = "YOUR_GOOGLE_API_KEY";
const GOOGLE_APP_ID = "YOUR_GOOGLE_APP_ID"; // GCP project number
// TODO: Replace with the tenant's Azure AD app clientId (OneDrive Picker)
const ONEDRIVE_CLIENT_ID = "YOUR_AZURE_CLIENT_ID";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

declare global {
  interface Window {
    gapi?: any;
    google?: any;
    OneDrive?: any;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

type PickedFile = { name: string; url: string; provider: "google" | "onedrive" };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function AttachMaterialModal({ open, onOpenChange, onCreated }: Props) {
  const { currentTenantId } = useTenant();
  const { user } = useAuth();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<"google" | "onedrive" | null>(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setTitle("");
      setLoadingProvider(null);
    }
  }, [open]);

  const openGooglePicker = async () => {
    try {
      setLoadingProvider("google");
      await Promise.all([
        loadScript("https://apis.google.com/js/api.js"),
        loadScript("https://accounts.google.com/gsi/client"),
      ]);

      await new Promise<void>((resolve) => window.gapi.load("picker", { callback: () => resolve() }));

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: (resp: any) => {
          if (resp.error) {
            toast.error("Google auth was cancelled");
            setLoadingProvider(null);
            return;
          }
          const view = new window.google.picker.DocsView()
            .setIncludeFolders(false)
            .setSelectFolderEnabled(false);
          const picker = new window.google.picker.PickerBuilder()
            .setAppId(GOOGLE_APP_ID)
            .setOAuthToken(resp.access_token)
            .setDeveloperKey(GOOGLE_DEVELOPER_KEY)
            .addView(view)
            .setCallback((data: any) => {
              if (data.action === window.google.picker.Action.PICKED) {
                const doc = data.docs?.[0];
                if (doc) {
                  setPicked({
                    name: doc.name,
                    url: doc.url || `https://drive.google.com/file/d/${doc.id}/view`,
                    provider: "google",
                  });
                  setTitle((t) => t || doc.name);
                }
              }
              if (data.action !== window.google.picker.Action.LOADED) setLoadingProvider(null);
            })
            .build();
          picker.setVisible(true);
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open Google Drive picker");
      setLoadingProvider(null);
    }
  };

  const openOneDrivePicker = async () => {
    try {
      setLoadingProvider("onedrive");
      await loadScript("https://js.live.net/v7.2/OneDrive.js");
      window.OneDrive.open({
        clientId: ONEDRIVE_CLIENT_ID,
        action: "share",
        multiSelect: false,
        advanced: { redirectUri: window.location.origin },
        success: (files: any) => {
          const f = files?.value?.[0];
          if (f) {
            setPicked({
              name: f.name,
              url: f.permissions?.[0]?.link?.webUrl || f.webUrl || f["@microsoft.graph.downloadUrl"],
              provider: "onedrive",
            });
            setTitle((t) => t || f.name);
          }
          setLoadingProvider(null);
        },
        cancel: () => setLoadingProvider(null),
        error: (e: any) => {
          toast.error(e?.message ?? "OneDrive picker error");
          setLoadingProvider(null);
        },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to open OneDrive picker");
      setLoadingProvider(null);
    }
  };

  const save = async () => {
    if (!picked || !currentTenantId || !user) return;
    setSaving(true);
    const { error } = await supabase.from("notes").insert({
      center_id: currentTenantId,
      title: title.trim() || picked.name,
      file_name: picked.name,
      file_url: picked.url,
      file_type: picked.provider === "google" ? "google_drive" : "onedrive",
      uploaded_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Material attached");
    onCreated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/90 backdrop-blur-xl border border-white/40 rounded-3xl p-6 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#0F172A]">Attach material</DialogTitle>
          <DialogDescription>Pick a file from your cloud drive — only the link is stored.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={openGooglePicker}
            disabled={!!loadingProvider}
            className="rounded-full border border-white/60 bg-white/70 backdrop-blur-sm px-4 py-3 flex items-center justify-center gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-white transition disabled:opacity-60"
          >
            {loadingProvider === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 87.3 78" className="h-5 w-5" aria-hidden>
                <path fill="#0066da" d="M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
                <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" />
                <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.7l5.85 11.5z" />
                <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" />
                <path fill="#2684fc" d="M59.7 53H27.6L13.85 76.8c1.35.8 2.9 1.2 4.5 1.2h50.6c1.6 0 3.15-.45 4.5-1.2z" />
                <path fill="#ffba00" d="M73.4 26.5 60.6 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.05 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
              </svg>
            )}
            <span className="text-sm font-medium text-[#0F172A]">Google Drive</span>
          </button>

          <button
            type="button"
            onClick={openOneDrivePicker}
            disabled={!!loadingProvider}
            className="rounded-full border border-white/60 bg-white/70 backdrop-blur-sm px-4 py-3 flex items-center justify-center gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:bg-white transition disabled:opacity-60"
          >
            {loadingProvider === "onedrive" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
                <path fill="#0364B8" d="M12.8 19.2 20 14l7.3 4.8a5.6 5.6 0 0 0-5.4-4.4h-.5a7.3 7.3 0 0 0-13.7 2.1A5.6 5.6 0 0 0 6 27h4.2z" />
                <path fill="#0078D4" d="M27.3 18.8 20 14l-7.2 5.2L10.2 27h15a4.6 4.6 0 0 0 4.6-4.6c0-1.5-.7-2.8-1.7-3.6z" />
              </svg>
            )}
            <span className="text-sm font-medium text-[#0F172A]">OneDrive</span>
          </button>
        </div>

        {picked && (
          <div className="mt-4 rounded-2xl bg-white/60 backdrop-blur-sm border border-white/50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Selected</p>
            <p className="text-sm text-[#0F172A] truncate">{picked.name}</p>
            <a href={picked.url} target="_blank" rel="noreferrer" className="text-xs text-[#0052FF] break-all">
              {picked.url}
            </a>
            <div className="mt-4 space-y-2">
              <Label htmlFor="title" className="text-xs text-slate-600">Display title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-full bg-white/80"
                placeholder="e.g. Chapter 4 — Kinematics notes"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!picked || saving}
            className="rounded-full bg-[#0052FF] hover:bg-[#0052FF]/90 text-white px-6"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Attach material
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
