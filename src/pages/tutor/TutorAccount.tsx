import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LogOut, Shield, Building2, Users, CalendarDays, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface CenterInfo {
  id: string;
  name: string;
}

export function TutorAccount() {
  const { user, profile, roles, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [center, setCenter] = useState<CenterInfo | null>(null);
  const [assignedClassCount, setAssignedClassCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id || !profile?.center_id) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const [centerRes, classesRes] = await Promise.all([
        supabase
          .from("tuition_centers")
          .select("id,name")
          .eq("id", profile.center_id)
          .maybeSingle(),
        supabase
          .from("class_tutors")
          .select("id", { count: "exact", head: true })
          .eq("tutor_user_id", user.id)
          .eq("center_id", profile.center_id),
      ]);
      if (cancelled) return;
      if (centerRes.data) setCenter(centerRes.data as CenterInfo);
      setAssignedClassCount(classesRes.count ?? 0);
      setIsLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, (profile as any)?.center_id]);

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "T";

  const memberSince = profile?.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy")
    : "—";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Account</h1>
        <p className="text-muted-foreground">Your tutor profile and workspace access</p>
      </div>

      <Card className="p-6 rounded-3xl bg-card border-border">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-semibold">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {profile?.full_name || "Tutor"}
            </h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
              <Mail className="w-3.5 h-3.5" />
              {user?.email || "—"}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {roles.length === 0 ? (
                <Badge variant="secondary">No roles</Badge>
              ) : (
                roles.map((r) => (
                  <Badge key={r} variant="secondary" className="capitalize">
                    {r}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 rounded-3xl bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Tenant</p>
              {isLoading ? (
                <Skeleton className="h-5 w-24 mt-1" />
              ) : (
                <p className="font-medium text-foreground truncate">
                  {center?.name || "—"}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-3xl bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Assigned classes</p>
              {isLoading ? (
                <Skeleton className="h-5 w-10 mt-1" />
              ) : (
                <p className="font-medium text-foreground">{assignedClassCount}</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-3xl bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Member since</p>
              <p className="font-medium text-foreground">{memberSince}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 rounded-3xl bg-card border-border space-y-2">
        {hasRole("admin") && (
          <Button
            variant="outline"
            className="w-full justify-start rounded-xl"
            onClick={() => navigate("/admin")}
          >
            <Shield className="w-4 h-4 mr-2" />
            Switch to Admin View
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </Card>
    </div>
  );
}

export default TutorAccount;
