import { useState, useEffect } from "react";
import { Save, Eye, EyeOff, Type, Image, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useContentSections, ContentSection } from "@/hooks/useContentSections";

export function SiteContentTab() {
  const { sections, isLoading, refetch } = useContentSections();
  const [editingSections, setEditingSections] = useState<Record<string, ContentSection>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (sections.length > 0 && Object.keys(editingSections).length === 0) {
      const map: Record<string, ContentSection> = {};
      sections.forEach((s) => (map[s.id] = { ...s }));
      setEditingSections(map);
    }
  }, [sections]);

  const updateField = (sectionId: string, field: keyof ContentSection, value: unknown) => {
    setEditingSections((prev) => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], [field]: value },
    }));
  };

  const updateContent = (sectionId: string, key: string, value: string) => {
    setEditingSections((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        content: { ...prev[sectionId].content, [key]: value },
      },
    }));
  };

  const handleImageUpload = async (sectionId: string, contentKey: string, file: File) => {
    const section = editingSections[sectionId];
    if (!section) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${section.section_key}/${contentKey}_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from("cms-assets").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("cms-assets").getPublicUrl(fileName);
      updateContent(sectionId, contentKey, data.publicUrl);
      toast({ title: "✅ Image uploaded" });
    } catch (error) {
      toast({ title: "Error", description: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const saveSection = async (sectionId: string) => {
    const section = editingSections[sectionId];
    if (!section) return;

    setSavingIds((prev) => new Set(prev).add(sectionId));
    try {
      const { error } = await supabase
        .from("content_sections")
        .update({
          title: section.title,
          subtitle: section.subtitle,
          content: section.content as unknown as Record<string, never>,
          is_visible: section.is_visible,
        })
        .eq("id", sectionId);

      if (error) throw error;
      toast({ title: "Live Site Updated 🟢", description: `${getSectionLabel(section.section_key)} saved!` });
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  const toggleVisibility = async (sectionId: string) => {
    const section = editingSections[sectionId];
    if (!section) return;
    const newVisible = !section.is_visible;
    updateField(sectionId, "is_visible", newVisible);

    try {
      const { error } = await supabase
        .from("content_sections")
        .update({ is_visible: newVisible })
        .eq("id", sectionId);
      if (error) throw error;
      toast({ title: newVisible ? "✅ Section visible" : "Section hidden" });
    } catch (error) {
      updateField(sectionId, "is_visible", !newVisible);
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const getSectionLabel = (key: string): string => {
    const labels: Record<string, string> = {
      hero: "🎯 Hero Section",
      subjects: "📚 Subjects Section",
      tutors: "👨‍🏫 Tutors Section",
      testimonials: "💬 Testimonials",
    };
    return labels[key] || key;
  };

  const renderSectionFields = (section: ContentSection) => {
    const s = editingSections[section.id];
    if (!s) return null;

    return (
      <div className="space-y-4">
        {/* Common fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={s.title || ""}
              onChange={(e) => updateField(section.id, "title", e.target.value)}
              placeholder="Section title..."
            />
          </div>
          <div className="space-y-2">
            <Label>Subtitle</Label>
            <Input
              value={s.subtitle || ""}
              onChange={(e) => updateField(section.id, "subtitle", e.target.value)}
              placeholder="Section subtitle..."
            />
          </div>
        </div>

        {/* Section-specific content */}
        {section.section_key === "hero" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Type className="w-3 h-3" /> Tagline</Label>
              <Input
                value={String(s.content?.tagline || "")}
                onChange={(e) => updateContent(section.id, "tagline", e.target.value)}
                placeholder="Your compelling tagline..."
              />
            </div>
            <div className="space-y-2">
              <Label>CTA Button Text</Label>
              <Input
                value={String(s.content?.cta_text || "")}
                onChange={(e) => updateContent(section.id, "cta_text", e.target.value)}
                placeholder="Get Started"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-1"><Image className="w-3 h-3" /> Hero Image URL</Label>
              <div className="flex gap-2">
                <Input
                  value={String(s.content?.hero_image || "")}
                  onChange={(e) => updateContent(section.id, "hero_image", e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(section.id, "hero_image", file);
                    }}
                  />
                  <Button variant="outline" size="sm" type="button" disabled={isUploading} asChild>
                    <span>{isUploading ? "..." : "Upload"}</span>
                  </Button>
                </label>
              </div>
            </div>
          </div>
        )}

        {section.section_key === "tutors" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Featured Tutor</Label>
              <Input
                value={String(s.content?.featured_tutor || "")}
                onChange={(e) => updateContent(section.id, "featured_tutor", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={String(s.content?.tutor_description || "")}
                onChange={(e) => updateContent(section.id, "tutor_description", e.target.value)}
              />
            </div>
          </div>
        )}

        {section.section_key === "subjects" && (
          <div className="space-y-2">
            <Label>Section Description</Label>
            <Textarea
              value={String(s.content?.description || "")}
              onChange={(e) => updateContent(section.id, "description", e.target.value)}
              rows={2}
            />
          </div>
        )}

        {section.section_key === "testimonials" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Quote</Label>
              <Textarea
                value={String(s.content?.quote || "")}
                onChange={(e) => updateContent(section.id, "quote", e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Student Name</Label>
              <Input
                value={String(s.content?.student_name || "")}
                onChange={(e) => updateContent(section.id, "student_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Input
                value={String(s.content?.grade || "")}
                onChange={(e) => updateContent(section.id, "grade", e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Site Content</h2>
        <p className="text-sm text-muted-foreground">Edit landing page text and media. Changes go live instantly.</p>
      </div>

      {sections.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No content sections</h3>
          <p className="text-sm text-muted-foreground">Sections will appear once created in the database.</p>
        </Card>
      ) : (
        sections.map((section) => (
          <Card key={section.id} className="p-5 bg-card border-border space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-foreground">
                  {getSectionLabel(section.section_key)}
                </h3>
                <Badge variant={editingSections[section.id]?.is_visible ? "default" : "secondary"}>
                  {editingSections[section.id]?.is_visible ? "Visible" : "Hidden"}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleVisibility(section.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {editingSections[section.id]?.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <Button
                  size="sm"
                  onClick={() => saveSection(section.id)}
                  disabled={savingIds.has(section.id)}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {savingIds.has(section.id) ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {renderSectionFields(section)}
          </Card>
        ))
      )}
    </div>
  );
}
