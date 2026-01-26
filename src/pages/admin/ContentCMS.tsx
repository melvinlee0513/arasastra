import { useEffect, useState } from "react";
import { Eye, EyeOff, Save, RefreshCw, GripVertical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  const [isSaving, setIsSaving] = useState(false);
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
      // Cast content to expected type
      const typedData = (data || []).map(section => ({
        ...section,
        content: (typeof section.content === 'object' && section.content !== null) 
          ? section.content as Record<string, unknown>
          : {}
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

  const updateSection = (id: string, field: string, value: any) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id ? { ...section, [field]: value } : section
      )
    );
  };

  const updateSectionContent = (id: string, key: string, value: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === id
          ? { ...section, content: { ...section.content, [key]: value } }
          : section
      )
    );
  };

  const saveAllSections = async () => {
    setIsSaving(true);
    try {
      for (const section of sections) {
        const { error } = await supabase
          .from("content_sections")
          .update({
            title: section.title,
            subtitle: section.subtitle,
            content: section.content as unknown as Record<string, never>,
            is_visible: section.is_visible,
            display_order: section.display_order,
          })
          .eq("id", section.id);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "All sections saved successfully!",
      });
    } catch (error) {
      console.error("Error saving sections:", error);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-40 bg-muted rounded" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Content Management</h1>
          <p className="text-muted-foreground">
            Manage your landing page sections (Wix-style editor)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSections} disabled={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={saveAllSections} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* Section Manager */}
      <div className="space-y-4">
        {sections.map((section) => (
          <Card key={section.id} className="p-6 bg-card border-border">
            <div className="flex items-start gap-4">
              <div className="mt-2 cursor-grab text-muted-foreground">
                <GripVertical className="w-5 h-5" />
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">
                    {getSectionLabel(section.section_key)}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`visible-${section.id}`} className="text-sm text-muted-foreground">
                      {section.is_visible ? (
                        <Eye className="w-4 h-4 inline mr-1" />
                      ) : (
                        <EyeOff className="w-4 h-4 inline mr-1" />
                      )}
                      {section.is_visible ? "Visible" : "Hidden"}
                    </Label>
                    <Switch
                      id={`visible-${section.id}`}
                      checked={section.is_visible}
                      onCheckedChange={(checked) =>
                        updateSection(section.id, "is_visible", checked)
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`title-${section.id}`}>Title</Label>
                    <Input
                      id={`title-${section.id}`}
                      value={section.title || ""}
                      onChange={(e) => updateSection(section.id, "title", e.target.value)}
                      placeholder="Section title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`subtitle-${section.id}`}>Subtitle</Label>
                    <Input
                      id={`subtitle-${section.id}`}
                      value={section.subtitle || ""}
                      onChange={(e) => updateSection(section.id, "subtitle", e.target.value)}
                      placeholder="Section subtitle"
                    />
                  </div>
                </div>

                {/* Section-specific fields */}
                {section.section_key === "hero" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <Label>Tagline</Label>
                      <Input
                        value={String(section.content?.tagline || "")}
                        onChange={(e) =>
                          updateSectionContent(section.id, "tagline", e.target.value)
                        }
                        placeholder="Hero tagline"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CTA Button Text</Label>
                      <Input
                        value={String(section.content?.cta_text || "")}
                        onChange={(e) =>
                          updateSectionContent(section.id, "cta_text", e.target.value)
                        }
                        placeholder="Call to action text"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Live Preview Note */}
      <Card className="p-4 bg-accent/10 border-accent/30">
        <p className="text-sm text-foreground">
          <strong>💡 Tip:</strong> Changes are saved to the database immediately when you click
          "Save All". The public landing page will reflect these changes after refresh.
        </p>
      </Card>
    </div>
  );
}
