import { useEffect, useState, useCallback } from "react";
import { MessageCircle, RefreshCw, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

const STATUS_OPTIONS = ["New", "Contacted", "Interested", "Enrolled", "Cold"] as const;

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Contacted: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Interested: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Enrolled: "bg-green-500/20 text-green-300 border-green-500/30",
  Cold: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function LeadsManagement() {
  const [leads, setLeads] = useState<LeadProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkValue, setRemarkValue] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      // Get all student profiles - join with pricing_plans for plan name
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, phone, email, plan_id, lead_status, admin_remarks, last_contacted_at, created_at, plan:pricing_plans(name, price)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter to only students by checking user_roles
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
    setLeads((prev) =>
      prev.map((l) => (l.id === profileId ? { ...l, lead_status: status } : l))
    );

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ lead_status: status, last_contacted_at: new Date().toISOString() })
        .eq("id", profileId);

      if (error) throw error;
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

  const openWhatsApp = (phone: string | null, name: string) => {
    if (!phone) {
      toast({ title: "No phone number", description: "This lead has no phone number", variant: "destructive" });
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    const message = encodeURIComponent(
      `Hi ${name}, welcome to Arasa A+! I saw you registered and wanted to personally reach out. How can I help you get started?`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
  };

  const filteredLeads = leads.filter(
    (l) =>
      l.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.phone?.includes(search)
  );

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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
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
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            <Badge
                              className={`text-xs border ${STATUS_COLORS[status]}`}
                            >
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
    </div>
  );
}
