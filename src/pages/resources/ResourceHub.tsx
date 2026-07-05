import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AttachMaterialModal } from "@/components/resources/AttachMaterialModal";
import { FileText, Video, Plus, ExternalLink, PlayCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Tab = "videos" | "materials";

export default function ResourceHub() {
  const { currentTenantId } = useTenant();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("videos");
  const [attachOpen, setAttachOpen] = useState(false);

  const canUpload = role === "admin" || role === "superadmin" || role === "tutor";

  const videos = useQuery({
    queryKey: ["resource-hub", "videos", currentTenantId],
    enabled: !!currentTenantId && tab === "videos",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_resources")
        .select("id,title,description,video_url,thumbnail_url,duration_seconds,created_at,is_published")
        .eq("center_id", currentTenantId!)
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const materials = useQuery({
    queryKey: ["resource-hub", "materials", currentTenantId],
    enabled: !!currentTenantId && tab === "materials",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("id,title,file_name,file_url,file_type,created_at")
        .eq("center_id", currentTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold text-[#0F172A] tracking-tight">
            Resource Hub
          </h1>
          <p className="text-slate-500 mt-1">
            Video replays and class materials for your center.
          </p>
        </header>

        {/* Tab pills */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/70 backdrop-blur-md border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <TabPill active={tab === "videos"} onClick={() => setTab("videos")} icon={<Video className="h-4 w-4" />}>
              Video Replays
            </TabPill>
            <TabPill active={tab === "materials"} onClick={() => setTab("materials")} icon={<FileText className="h-4 w-4" />}>
              Class Materials
            </TabPill>
          </div>

          {tab === "materials" && canUpload && (
            <Button
              onClick={() => setAttachOpen(true)}
              className="rounded-full bg-[#0052FF] hover:bg-[#0052FF]/90 text-white px-5 shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
            >
              <Plus className="h-4 w-4 mr-1" /> Attach material
            </Button>
          )}
        </div>

        {tab === "videos" && (
          <section>
            {videos.isLoading && <SkeletonList />}
            {videos.data && videos.data.length === 0 && (
              <EmptyState icon={<Video className="h-6 w-6" />} label="No published video replays yet." />
            )}
            <div className="grid gap-3">
              {videos.data?.map((v) => (
                <a
                  key={v.id}
                  href={v.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-4 p-4 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/50 hover:bg-white/80 transition shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                >
                  <div className="h-12 w-12 rounded-2xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center shrink-0">
                    <PlayCircle className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#0F172A] font-medium truncate">{v.title}</p>
                    {v.description && <p className="text-xs text-slate-500 truncate">{v.description}</p>}
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {v.created_at && formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-[#0052FF] transition" />
                </a>
              ))}
            </div>
          </section>
        )}

        {tab === "materials" && (
          <section>
            {materials.isLoading && <SkeletonList />}
            {materials.data && materials.data.length === 0 && (
              <EmptyState icon={<FileText className="h-6 w-6" />} label="No materials attached yet." />
            )}
            <div className="grid gap-3">
              {materials.data?.map((m) => (
                <a
                  key={m.id}
                  href={m.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-4 p-4 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/50 hover:bg-white/80 transition shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                >
                  <ProviderBadge type={m.file_type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#0F172A] font-medium truncate">{m.title}</p>
                    <p className="text-xs text-slate-500 truncate">{m.file_name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {m.created_at && formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-[#0052FF] transition" />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>

      <AttachMaterialModal
        open={attachOpen}
        onOpenChange={setAttachOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["resource-hub", "materials", currentTenantId] })}
      />
    </div>
  );
}

function TabPill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
        active ? "bg-[#0052FF] text-white shadow-[0_8px_30px_rgb(0,82,255,0.25)]" : "text-[#0F172A] hover:bg-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function ProviderBadge({ type }: { type: string | null }) {
  const isGoogle = type === "google_drive";
  const isOneDrive = type === "onedrive";
  return (
    <div className="h-12 w-12 rounded-2xl bg-white/70 border border-white/60 flex items-center justify-center shrink-0">
      {isGoogle ? (
        <svg viewBox="0 0 87.3 78" className="h-5 w-5">
          <path fill="#0066da" d="M6.6 66.85 10.45 73.5c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
          <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" />
          <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.7l5.85 11.5z" />
          <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" />
          <path fill="#2684fc" d="M59.7 53H27.6L13.85 76.8c1.35.8 2.9 1.2 4.5 1.2h50.6c1.6 0 3.15-.45 4.5-1.2z" />
          <path fill="#ffba00" d="M73.4 26.5 60.6 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.05 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
        </svg>
      ) : isOneDrive ? (
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <path fill="#0364B8" d="M12.8 19.2 20 14l7.3 4.8a5.6 5.6 0 0 0-5.4-4.4h-.5a7.3 7.3 0 0 0-13.7 2.1A5.6 5.6 0 0 0 6 27h4.2z" />
          <path fill="#0078D4" d="M27.3 18.8 20 14l-7.2 5.2L10.2 27h15a4.6 4.6 0 0 0 4.6-4.6c0-1.5-.7-2.8-1.7-3.6z" />
        </svg>
      ) : (
        <FileText className="h-5 w-5 text-slate-500" />
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-white/40 border border-white/50 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/40 backdrop-blur-sm p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-[#0052FF]/10 text-[#0052FF] flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-slate-500 text-sm">{label}</p>
    </div>
  );
}
