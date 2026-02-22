import { useEffect, useState, useCallback } from "react";
import { MessageCircle, RefreshCw, Search, LayoutGrid, Table as TableIcon, GripVertical, AlertTriangle, UserPlus, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DndContext,
  closestCorners,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface LeadProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  plan_id: string | null;
  lead_status: string;
  admin_remarks: string | null;
  last_contacted_at: string | null;
  created_at: string | null;
  plan?: { name: string; price: string } | null;
}

const PIPELINE_STATUSES = ["New", "Contacted", "Interested", "Enrolled", "At-Risk", "Churned"] as const;

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  Contacted: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
  Interested: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  Enrolled: "bg-green-500/20 text-green-600 border-green-500/30",
  "At-Risk": "bg-orange-500/20 text-orange-600 border-orange-500/30",
  Churned: "bg-red-500/20 text-red-600 border-red-500/30",
  Cold: "bg-red-500/20 text-red-600 border-red-500/30",
};

function KanbanCard({ lead, onWhatsApp }: { lead: LeadProfile; onWhatsApp: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="p-3 bg-card border-border hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground text-sm truncate">{lead.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{lead.email || "No email"}</p>
            {lead.phone && (
              <p className="text-xs text-muted-foreground">{lead.phone}</p>
            )}
          </div>
          <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
        </div>
        {lead.plan && (
          <Badge variant="secondary" className="text-xs mt-2">
            {lead.plan.name}
          </Badge>
        )}
        {lead.admin_remarks && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{lead.admin_remarks}</p>
        )}
        <div className="mt-2 flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-green-500 hover:text-green-400"
            onClick={(e) => { e.stopPropagation(); onWhatsApp(); }}
          >
            <MessageCircle className="w-3 h-3" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function KanbanColumn({ status, leads, onWhatsApp }: { status: string; leads: LeadProfile[]; onWhatsApp: (phone: string | null, name: string) => void }) {
  return (
    <div className="flex-shrink-0 w-64 min-w-[256px]" data-status={status}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Badge className={`text-xs border ${STATUS_COLORS[status] || "bg-muted text-muted-foreground"}`}>
            {status}
          </Badge>
          <span className="text-xs text-muted-foreground font-medium">{leads.length}</span>
        </div>
      </div>
      <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-muted/30 border border-dashed border-border">
        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            onWhatsApp={() => onWhatsApp(lead.phone, lead.full_name)}
          />
        ))}
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadsManagement() {
  const [leads, setLeads] = useState<LeadProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkValue, setRemarkValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, phone, email, plan_id, lead_status, admin_remarks, last_contacted_at, created_at, plan:pricing_plans(name, price)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: studentRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");

      const studentUserIds = new Set((studentRoles || []).map((r) => r.user_id));
      const studentLeads = (data || []).filter((p) => studentUserIds.has(p.user_id));

      setLeads(studentLeads as LeadProfile[]);
    } catch (error) {
      console.error("Error fetching leads:", error);
      toast({ title: "Error", description: "Failed to load leads", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLeads();
    setIsRefreshing(false);
    toast({ title: "✅ Refreshed", description: "Lead data updated" });
  };

  const updateLeadStatus = async (profileId: string, status: string) => {
    const oldLead = leads.find((l) => l.id === profileId);
    setLeads((prev) =>
      prev.map((l) => (l.id === profileId ? { ...l, lead_status: status } : l))
    );

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ lead_status: status, last_contacted_at: new Date().toISOString() })
        .eq("id", profileId);

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from("admin_audit_log").insert({
          admin_id: user.id,
          action: "update_lead_status",
          entity_type: "profile",
          entity_id: profileId,
          metadata: { old_status: oldLead?.lead_status, new_status: status },
        });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      fetchLeads();
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const saveRemarks = useCallback(
    async (profileId: string, remarks: string) => {
      setLeads((prev) =>
        prev.map((l) => (l.id === profileId ? { ...l, admin_remarks: remarks } : l))
      );
      setEditingRemarkId(null);

      try {
        const { error } = await supabase
          .from("profiles")
          .update({ admin_remarks: remarks })
          .eq("id", profileId);

        if (error) throw error;
      } catch (error) {
        console.error("Error saving remarks:", error);
        fetchLeads();
      }
    },
    []
  );

  const openWhatsApp = (phone: string | null, name: string, isNudge?: boolean) => {
    if (!phone) {
      toast({ title: "No phone number", description: "This lead has no phone number", variant: "destructive" });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    const message = isNudge
      ? encodeURIComponent(`Hi ${name}, your spot in Arasa A+ is waiting! 🎓 We'd love to help you get started on your learning journey. Let me know if you have any questions!`)
      : encodeURIComponent(`Hi ${name}, welcome to Arasa A+! I saw you registered and wanted to personally reach out. How can I help you get started?`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedLeadId = active.id as string;
    
    // Find which column was dropped on
    const overElement = document.elementFromPoint(
      (event.activatorEvent as PointerEvent)?.clientX || 0,
      (event.activatorEvent as PointerEvent)?.clientY || 0
    );

    // Find the status column
    let targetStatus: string | null = null;
    const columns = document.querySelectorAll("[data-status]");
    columns.forEach((col) => {
      const rect = col.getBoundingClientRect();
      const pointerX = (event.activatorEvent as PointerEvent)?.clientX || 0;
      if (pointerX >= rect.left && pointerX <= rect.right) {
        targetStatus = col.getAttribute("data-status");
      }
    });

    // Fallback: check if dropped on another lead card
    if (!targetStatus && over.data?.current?.lead) {
      targetStatus = (over.data.current.lead as LeadProfile).lead_status;
    }

    if (targetStatus) {
      const currentLead = leads.find((l) => l.id === draggedLeadId);
      if (currentLead && currentLead.lead_status !== targetStatus) {
        updateLeadStatus(draggedLeadId, targetStatus);
        toast({ title: "Status updated", description: `${currentLead.full_name} → ${targetStatus}` });
      }
    }
  };

  const filteredLeads = leads.filter((l) => {
    const matchesSearch =
      l.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.phone?.includes(search);
    const matchesStatus = statusFilter === "all" || l.lead_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getLeadsByStatus = (status: string) =>
    filteredLeads.filter((l) => l.lead_status === status);

  // At-risk detection: registered > 24h ago, no payment
  const warmLeads = leads.filter((l) => {
    if (l.lead_status !== "New" && l.lead_status !== "Contacted") return false;
    const created = new Date(l.created_at || "");
    const hoursAgo = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    return hoursAgo > 24;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Lead Management</h1>
          <p className="text-muted-foreground">
            {leads.length} total leads • Track and manage student registrations
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* At-Risk Alert */}
      {warmLeads.length > 0 && (
        <Card className="p-4 bg-orange-500/10 border-orange-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <div className="flex-1">
              <p className="font-medium text-foreground">{warmLeads.length} warm leads need attention</p>
              <p className="text-sm text-muted-foreground">Registered 24+ hours ago without converting</p>
            </div>
            <div className="flex gap-2">
              {warmLeads.slice(0, 3).map((lead) => (
                <Button
                  key={lead.id}
                  variant="outline"
                  size="sm"
                  className="text-xs border-orange-500/30 text-orange-600 hover:bg-orange-500/10"
                  onClick={() => openWhatsApp(lead.phone, lead.full_name, true)}
                >
                  <MessageCircle className="w-3 h-3 mr-1" />
                  Nudge {lead.full_name.split(" ")[0]}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {PIPELINE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* View Toggle */}
      <Tabs defaultValue="kanban" className="w-full">
        <TabsList>
          <TabsTrigger value="kanban" className="gap-2">
            <LayoutGrid className="w-4 h-4" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="table" className="gap-2">
            <TableIcon className="w-4 h-4" />
            Table
          </TabsTrigger>
        </TabsList>

        {/* Kanban View */}
        <TabsContent value="kanban" className="mt-4">
          {isLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {PIPELINE_STATUSES.map((s) => (
                <div key={s} className="w-64 space-y-2 flex-shrink-0">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 overflow-x-auto pb-4">
                {PIPELINE_STATUSES.map((status) => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    leads={getLeadsByStatus(status)}
                    onWhatsApp={openWhatsApp}
                  />
                ))}
              </div>
            </DndContext>
          )}
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table" className="mt-4">
          <Card className="border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[200px]">Remarks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5)
                    .fill(0)
                    .map((_, i) => (
                      <TableRow key={i}>
                        {Array(7)
                          .fill(0)
                          .map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-20" />
                            </TableCell>
                          ))}
                      </TableRow>
                    ))
                ) : filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No leads found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads.map((lead) => (
                    <TableRow key={lead.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{lead.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{lead.email || "—"}</TableCell>
                      <TableCell>
                        {lead.plan ? (
                          <Badge variant="secondary" className="text-xs">
                            {lead.plan.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={lead.lead_status}
                          onValueChange={(val) => updateLeadStatus(lead.id, val)}
                        >
                          <SelectTrigger className="w-[130px] h-8">
                            <Badge
                              className={`text-xs border ${STATUS_COLORS[lead.lead_status] || "bg-muted text-muted-foreground"}`}
                            >
                              {lead.lead_status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                <Badge className={`text-xs border ${STATUS_COLORS[status]}`}>
                                  {status}
                                </Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {editingRemarkId === lead.id ? (
                          <Input
                            autoFocus
                            value={remarkValue}
                            onChange={(e) => setRemarkValue(e.target.value)}
                            onBlur={() => saveRemarks(lead.id, remarkValue)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveRemarks(lead.id, remarkValue);
                            }}
                            className="h-8 text-sm"
                            placeholder="Add notes..."
                          />
                        ) : (
                          <button
                            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer w-full text-left min-h-[32px] flex items-center"
                            onClick={() => {
                              setEditingRemarkId(lead.id);
                              setRemarkValue(lead.admin_remarks || "");
                            }}
                          >
                            {lead.admin_remarks || (
                              <span className="italic text-muted-foreground/50">Click to add...</span>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                          onClick={() => openWhatsApp(lead.phone, lead.full_name)}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
