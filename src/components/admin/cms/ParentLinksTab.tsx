import { useEffect, useState } from "react";
import { Plus, Trash2, Users, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ParentLink {
  id: string;
  parent_user_id: string;
  student_profile_id: string;
  created_at: string;
  parent_email?: string;
  student_name?: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  user_id: string;
}

export function ParentLinksTab() {
  const [links, setLinks] = useState<ParentLink[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [parentEmail, setParentEmail] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [linksRes, profilesRes] = await Promise.all([
      supabase.from("parent_student_links").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email, user_id"),
    ]);

    const allProfiles = profilesRes.data || [];
    setProfiles(allProfiles);

    if (linksRes.data) {
      const profileMap = new Map(allProfiles.map((p) => [p.id, p]));
      const userMap = new Map(allProfiles.map((p) => [p.user_id, p]));

      setLinks(linksRes.data.map((l) => ({
        ...l,
        student_name: profileMap.get(l.student_profile_id)?.full_name || "Unknown",
        parent_email: userMap.get(l.parent_user_id)?.email || l.parent_user_id,
      })));
    }
    setIsLoading(false);
  };

  const createLink = async () => {
    setIsSaving(true);
    try {
      // Find parent user by email
      const parentProfile = profiles.find((p) => p.email?.toLowerCase() === parentEmail.toLowerCase());
      if (!parentProfile) {
        toast({ title: "Error", description: "No user found with that email. The parent must have an account first.", variant: "destructive" });
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from("parent_student_links").insert({
        parent_user_id: parentProfile.user_id,
        student_profile_id: selectedStudentId,
      });

      if (error) throw error;
      toast({ title: "✅ Parent-student link created" });
      setShowDialog(false);
      setParentEmail("");
      setSelectedStudentId("");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create link", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const deleteLink = async (id: string) => {
    await supabase.from("parent_student_links").delete().eq("id", id);
    toast({ title: "🗑️ Link removed" });
    fetchData();
  };

  if (isLoading) {
    return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Parent–Student Links</h2>
          <p className="text-sm text-muted-foreground">{links.length} links configured</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-2" /> Link Parent
        </Button>
      </div>

      {links.length === 0 ? (
        <Card className="p-12 text-center border-border">
          <Link2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-foreground mb-2">No parent links yet</h3>
          <p className="text-sm text-muted-foreground">Link parent accounts to student profiles so parents can view their child's progress.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <Card key={link.id} className="p-4 border-border flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{link.student_name}</h3>
                <p className="text-sm text-muted-foreground truncate">Parent: {link.parent_email}</p>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => deleteLink(link.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link Parent to Student</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Parent Email</Label>
              <Input value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@example.com" type="email" />
            </div>
            <div className="space-y-2">
              <Label>Student</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student..." /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={createLink} disabled={!parentEmail || !selectedStudentId || isSaving}>
              {isSaving ? "Linking..." : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
