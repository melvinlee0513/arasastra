import { useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw, GripVertical, Edit, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContentSectionDrawer } from "@/components/admin/ContentSectionDrawer";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";

interface ContentSection {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: Record<string, unknown>;
  is_visible: boolean;
  display_order: number;
}

export function ContentCMS() {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<ContentSection | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("content_sections")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      const typedData = (data || []).map((section) => ({
        ...section,
        content:
          typeof section.content === "object" && section.content !== null
            ? (section.content as Record<string, unknown>)
            : {},
      }));
      setSections(typedData);
    } catch (error) {
      console.error("Error fetching sections:", error);
      toast({
        title: "Error",
        description: "Failed to load content sections",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Optimistic visibility toggle
  const visibilityMutation = useOptimisticMutation<{ id: string; is_visible: boolean }>({
    mutationFn: async ({ id, is_visible }) => {
      const { error } = await supabase
        .from("content_sections")
        .update({ is_visible })
        .eq("id", id);
      if (error) throw error;
    },
    onOptimisticUpdate: ({ id, is_visible }) => {
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_visible } : s))
      );
    },
    onRollback: ({ id, is_visible }) => {
      setSections((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_visible: !is_visible } : s))
      );
    },
    successMessage: "Visibility updated",
  });

  const handleVisibilityToggle = (section: ContentSection, checked: boolean) => {
    visibilityMutation.mutate({ id: section.id, is_visible: checked });
  };

  const handleSectionUpdate = (updatedSection: ContentSection) => {
    setSections((prev) =>
      prev.map((s) => (s.id === updatedSection.id ? updatedSection : s))
    );
  };

  const openEditor = (section: ContentSection) => {
    setSelectedSection(section);
    setIsDrawerOpen(true);
  };

  const getSectionLabel = (key: string): string => {
    const labels: Record<string, string> = {
      hero: "Hero Section",
      subjects: "Subjects Section",
      tutors: "Tutors Section",
      testimonials: "Testimonials Section",
    };
    return labels[key] || key;
  };

  const getSectionIcon = (key: string): string => {
    const icons: Record<string, string> = {
      hero: "🎯",
      subjects: "📚",
      tutors: "👨‍🏫",
      testimonials: "💬",
    };
    return icons[key] || "📄";
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Management</h1>
          <p className="text-muted-foreground">
            Wix-style editor for landing page sections
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSections} disabled={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Live Update Banner */}
      <Card className="p-4 bg-gradient-to-r from-accent/10 to-primary/10 border-accent/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Live Updates Enabled</p>
            <p className="text-sm text-muted-foreground">
              Changes are saved instantly and reflect on the public site in real-time.
            </p>
          </div>
        </div>
      </Card>

      {/* Section Manager */}
      <div className="space-y-4">
        {sections.map((section, index) => (
          <Card
            key={section.id}
            className="p-6 bg-card border-border hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start gap-4">
              {/* Drag Handle */}
              <div className="mt-2 cursor-grab text-muted-foreground hover:text-foreground transition-colors">
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Section Icon */}
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
                {getSectionIcon(section.section_key)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {getSectionLabel(section.section_key)}
                      </h3>
                      <Badge
                        variant={section.is_visible ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {section.is_visible ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {section.title || "No title set"} • {section.subtitle || "No subtitle"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    {/* Visibility Toggle */}
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`visible-${section.id}`}
                        className="text-sm text-muted-foreground cursor-pointer"
                      >
                        {section.is_visible ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </Label>
                      <Switch
                        id={`visible-${section.id}`}
                        checked={section.is_visible}
                        onCheckedChange={(checked) =>
                          handleVisibilityToggle(section, checked)
                        }
                        disabled={visibilityMutation.isPending}
                      />
                    </div>

                    {/* Edit Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditor(section)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                </div>

                {/* Preview of Content */}
                <div className="mt-3 p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Content Preview:</p>
                  <div className="text-sm text-foreground/80">
                    {section.section_key === "hero" && (
                      <span>
                        Tagline: "{String(section.content?.tagline || "Not set")}" | CTA: "
                        {String(section.content?.cta_text || "Not set")}"
                      </span>
                    )}
                    {section.section_key === "tutors" && (
                      <span>
                        Featured: {String(section.content?.featured_tutor || "Not set")}
                      </span>
                    )}
                    {section.section_key === "subjects" && (
                      <span>
                        Featured: {String(section.content?.featured_subjects || "Not set")}
                      </span>
                    )}
                    {section.section_key === "testimonials" && (
                      <span>
                        Quote by: {String(section.content?.student_name || "Not set")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {sections.length === 0 && (
        <Card className="p-12 text-center bg-card border-border">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Edit className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No content sections
          </h3>
          <p className="text-muted-foreground">
            Content sections will appear here once created in the database.
          </p>
        </Card>
      )}

      {/* Side Drawer Editor */}
      <ContentSectionDrawer
        section={selectedSection}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onSave={handleSectionUpdate}
      />
    </div>
  );
}
