import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Wrench,
  FileText,
  Video,
  Link2,
  Clock,
  Undo2,
  Trash2,
} from "lucide-react";

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  created_at: string;
}

interface LinkHealth {
  url: string;
  type: "video" | "pdf" | "image";
  title: string;
  status: "ok" | "error" | "checking";
}

export function AdminSettings() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);
  const [linkHealthResults, setLinkHealthResults] = useState<LinkHealth[]>([]);
  const [isCheckingLinks, setIsCheckingLinks] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMaintenanceStatus();
    fetchAuditLogs();
  }, []);

  const fetchMaintenanceStatus = async () => {
    setIsLoadingMaintenance(true);
    const { data } = await supabase
      .from("content_sections")
      .select("content")
      .eq("section_key", "maintenance_mode")
      .single();

    if (data?.content) {
      const content = data.content as Record<string, unknown>;
      setMaintenanceMode(content.enabled as boolean || false);
      setMaintenanceMessage((content.message as string) || "");
    }
    setIsLoadingMaintenance(false);
  };

  const toggleMaintenanceMode = async () => {
    const newState = !maintenanceMode;
    const { error } = await supabase
      .from("content_sections")
      .update({
        content: {
          enabled: newState,
          message: maintenanceMessage || "We are upgrading the experience. Please check back shortly.",
        },
      })
      .eq("section_key", "maintenance_mode");

    if (error) {
      toast({ title: "Error", description: "Failed to update maintenance mode", variant: "destructive" });
      return;
    }

    setMaintenanceMode(newState);
    toast({
      title: newState ? "🔧 Maintenance Mode ON" : "✅ Maintenance Mode OFF",
      description: newState
        ? "The site is now showing the maintenance page to students."
        : "The site is now live for all users.",
    });
  };

  const fetchAuditLogs = async () => {
    setIsLoadingAudit(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    setAuditLogs((data as unknown as AuditLog[]) || []);
    setIsLoadingAudit(false);
  };

  const runHealthCheck = async () => {
    setIsCheckingLinks(true);
    const results: LinkHealth[] = [];

    // Fetch all classes with video URLs
    const { data: classes } = await supabase
      .from("classes")
      .select("title, video_url, live_url");

    (classes || []).forEach((c) => {
      if (c.video_url) {
        results.push({ url: c.video_url, type: "video", title: c.title, status: "checking" });
      }
      if (c.live_url) {
        results.push({ url: c.live_url, type: "video", title: `${c.title} (Live)`, status: "checking" });
      }
    });

    // Fetch all notes with file URLs
    const { data: notes } = await supabase.from("notes").select("title, file_url");
    (notes || []).forEach((n) => {
      if (n.file_url) {
        results.push({ url: n.file_url, type: "pdf", title: n.title, status: "checking" });
      }
    });

    setLinkHealthResults([...results]);

    // Check each link
    const updated = await Promise.all(
      results.map(async (link) => {
        try {
          const res = await fetch(link.url, { method: "HEAD", mode: "no-cors" });
          return { ...link, status: "ok" as const };
        } catch {
          return { ...link, status: "error" as const };
        }
      })
    );

    setLinkHealthResults(updated);
    setIsCheckingLinks(false);

    const broken = updated.filter((l) => l.status === "error").length;
    toast({
      title: broken === 0 ? "✅ All Links Healthy" : `⚠️ ${broken} Broken Link(s) Found`,
      description: `Checked ${updated.length} resources across classes and notes.`,
      variant: broken > 0 ? "destructive" : "default",
    });
  };

  const okCount = linkHealthResults.filter((l) => l.status === "ok").length;
  const errorCount = linkHealthResults.filter((l) => l.status === "error").length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
        <p className="text-muted-foreground">Disaster recovery, health checks & maintenance controls</p>
      </div>

      <Tabs defaultValue="health" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="health" className="gap-2">
            <Activity className="w-4 h-4" /> Health Check
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2">
            <Wrench className="w-4 h-4" /> Maintenance
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <Shield className="w-4 h-4" /> Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Health Check Tab */}
        <TabsContent value="health" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Resource Health Check</h2>
              <p className="text-sm text-muted-foreground">Verify all video links and PDF URLs are live</p>
            </div>
            <Button onClick={runHealthCheck} disabled={isCheckingLinks} className="rounded-full">
              <RefreshCw className={`w-4 h-4 mr-2 ${isCheckingLinks ? "animate-spin" : ""}`} />
              {isCheckingLinks ? "Checking..." : "Run Health Check"}
            </Button>
          </div>

          {/* Summary Cards */}
          {linkHealthResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4 bg-card border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{linkHealthResults.length}</p>
                    <p className="text-xs text-muted-foreground">Total Links</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-card border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{okCount}</p>
                    <p className="text-xs text-muted-foreground">Healthy</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 bg-card border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{errorCount}</p>
                    <p className="text-xs text-muted-foreground">Broken</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Results Grid */}
          {linkHealthResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {linkHealthResults.map((link, i) => (
                <Card key={i} className="p-4 bg-card border-border">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-3 h-3 rounded-full flex-shrink-0 ${
                      link.status === "ok"
                        ? "bg-primary"
                        : link.status === "error"
                        ? "bg-destructive"
                        : "bg-muted-foreground animate-pulse"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {link.type === "video" ? (
                          <Video className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <p className="text-sm font-medium text-foreground truncate">{link.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{link.url}</p>
                    </div>
                    <Badge
                      variant={link.status === "ok" ? "secondary" : link.status === "error" ? "destructive" : "outline"}
                      className="flex-shrink-0 text-xs"
                    >
                      {link.status === "checking" ? "..." : link.status.toUpperCase()}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {linkHealthResults.length === 0 && !isCheckingLinks && (
            <Card className="p-12 bg-card border-border">
              <div className="text-center space-y-3">
                <Activity className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="font-semibold text-foreground">No checks run yet</p>
                <p className="text-sm text-muted-foreground">
                  Click "Run Health Check" to verify all video and document links.
                </p>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Maintenance Mode Tab */}
        <TabsContent value="maintenance" className="space-y-6">
          {isLoadingMaintenance ? (
            <Skeleton className="h-48 w-full rounded-3xl" />
          ) : (
            <Card className={`p-6 rounded-3xl border-2 transition-colors ${
              maintenanceMode ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    maintenanceMode ? "bg-destructive/10" : "bg-primary/10"
                  }`}>
                    {maintenanceMode ? (
                      <AlertTriangle className="w-6 h-6 text-destructive" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {maintenanceMode ? "Maintenance Mode Active" : "Site is Live"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {maintenanceMode
                        ? "Students see a branded maintenance page. Admin access is unaffected."
                        : "All users can access the platform normally."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={maintenanceMode}
                  onCheckedChange={toggleMaintenanceMode}
                />
              </div>

              {maintenanceMode && (
                <div className="mt-4 p-4 rounded-2xl bg-background border border-border">
                  <p className="text-xs text-muted-foreground mb-2">Maintenance message shown to students:</p>
                  <textarea
                    value={maintenanceMessage}
                    onChange={(e) => setMaintenanceMessage(e.target.value)}
                    className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground resize-none select-text"
                    rows={3}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 rounded-full"
                    onClick={async () => {
                      await supabase
                        .from("content_sections")
                        .update({ content: { enabled: true, message: maintenanceMessage } })
                        .eq("section_key", "maintenance_mode");
                      toast({ title: "✅ Message Updated" });
                    }}
                  >
                    Save Message
                  </Button>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Disaster Recovery Log</h2>
              <p className="text-sm text-muted-foreground">Every UPDATE/DELETE on critical tables is recorded</p>
            </div>
            <Button variant="outline" onClick={fetchAuditLogs} className="rounded-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {isLoadingAudit ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
            </div>
          ) : auditLogs.length > 0 ? (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <Card key={log.id} className="p-4 bg-card border-border rounded-2xl">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      log.action === "DELETE" ? "bg-destructive/10" : "bg-accent/10"
                    }`}>
                      {log.action === "DELETE" ? (
                        <Trash2 className="w-4 h-4 text-destructive" />
                      ) : (
                        <Undo2 className="w-4 h-4 text-accent" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={log.action === "DELETE" ? "destructive" : "secondary"} className="text-xs">
                          {log.action}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{log.table_name}</span>
                        <span className="text-xs text-muted-foreground">ID: {log.record_id.slice(0, 8)}…</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                      {log.old_data && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-text">
                            View Before/After Data
                          </summary>
                          <div className="mt-2 space-y-2 text-xs">
                            <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                              <p className="font-semibold text-destructive mb-1">Before:</p>
                              <pre className="overflow-x-auto select-text text-foreground/70">
                                {JSON.stringify(log.old_data, null, 2)}
                              </pre>
                            </div>
                            {log.new_data && (
                              <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                                <p className="font-semibold text-primary mb-1">After:</p>
                                <pre className="overflow-x-auto select-text text-foreground/70">
                                  {JSON.stringify(log.new_data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 bg-card border-border">
              <div className="text-center space-y-3">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="font-semibold text-foreground">No audit events yet</p>
                <p className="text-sm text-muted-foreground">
                  Changes to profiles, enrollments, payments & subscriptions will appear here.
                </p>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
