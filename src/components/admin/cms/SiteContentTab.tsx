import { useState, useEffect } from "react";
import { Save, Eye, EyeOff, Type, Image, FileText, History, Undo2, Check, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useContentSections, ContentSection } from "@/hooks/useContentSections";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface ContentVersion {
  id: string;
  section_id: string;
  draft_data: Record<string, unknown>;
  published_data: Record<string, unknown>;
  draft_title: string | null;
  draft_subtitle: string | null;
  status: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function SiteContentTab() {
  const { sections, isLoading, refetch } = useContentSections();
  const [editingSections, setEditingSections] = useState<Record<string, ContentSection>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [versions, setVersions] = useState<Record<string, ContentVersion[]>>({});
  const [previewSection, setPreviewSection] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (sections.length > 0 && Object.keys(editingSections).length === 0) {
      const map: Record<string, ContentSection> = {};
      sections.forEach((s) => (map[s.id] = { ...s }));
      setEditingSections(map);
    }
  }, [sections]);

  const fetchVersions = async (sectionId: string) => {
    const { data, error } = await supabase
      .from("content_versions")
      .select("*")
      .eq("section_id", sectionId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setVersions((prev) => ({
        ...prev,
        [sectionId]: data.map((v) => ({
          ...v,
          draft_data: (v.draft_data as Record<string, unknown>) || {},
          published_data: (v.published_data as Record<string, unknown>) || {},
        })),
      }));
    }
  };

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

  // Save as draft (creates a content_version entry)
  const saveDraft = async (sectionId: string) => {
    const section = editingSections[sectionId];
    if (!section) return;

    setSavingIds((prev) => new Set(prev).add(sectionId));
    try {
      // Get current published data from content_sections
      const original = sections.find((s) => s.id === sectionId);

      const { error } = await supabase.from("content_versions").insert({
        section_id: sectionId,
        draft_data: section.content as unknown as Record<string, never>,
        published_data: (original?.content || {}) as unknown as Record<string, never>,
        draft_title: section.title,
        draft_subtitle: section.subtitle,
        status: "draft",
        updated_by: user?.id,
      });

      if (error) throw error;

      // Log audit
      await supabase.from("admin_audit_log").insert({
        admin_id: user!.id,
        action: "save_draft",
        entity_type: "content_section",
        entity_id: sectionId,
        metadata: { section_key: section.section_key },
      });

      toast({ title: "📝 Draft Saved", description: `${getSectionLabel(section.section_key)} draft saved` });
      fetchVersions(sectionId);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save draft", variant: "destructive" });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  // Publish: update content_sections with current draft data
  const publishSection = async (sectionId: string) => {
    const section = editingSections[sectionId];
    if (!section) return;

    setPublishingIds((prev) => new Set(prev).add(sectionId));
    try {
      // Update the live content_sections table
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

      // Create a published version record
      await supabase.from("content_versions").insert({
        section_id: sectionId,
        draft_data: section.content as unknown as Record<string, never>,
        published_data: section.content as unknown as Record<string, never>,
        draft_title: section.title,
        draft_subtitle: section.subtitle,
        status: "published",
        updated_by: user?.id,
      });

      // Log audit
      await supabase.from("admin_audit_log").insert({
        admin_id: user!.id,
        action: "publish",
        entity_type: "content_section",
        entity_id: sectionId,
        metadata: { section_key: section.section_key },
      });

      toast({ title: "🟢 Published!", description: `${getSectionLabel(section.section_key)} is now live` });
      refetch();
      fetchVersions(sectionId);
    } catch (error) {
      toast({ title: "Error", description: "Failed to publish", variant: "destructive" });
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  const revertToVersion = async (sectionId: string, version: ContentVersion) => {
    const section = editingSections[sectionId];
    if (!section) return;

    // Load the version's data into the editor
    setEditingSections((prev) => ({
      ...prev,
      [sectionId]: {
        ...prev[sectionId],
        title: version.draft_title || prev[sectionId].title,
        subtitle: version.draft_subtitle || prev[sectionId].subtitle,
        content: version.draft_data as Record<string, unknown>,
      },
    }));

    // Log audit
    await supabase.from("admin_audit_log").insert({
      admin_id: user!.id,
      action: "revert",
      entity_type: "content_section",
      entity_id: sectionId,
      metadata: { version_id: version.id, section_key: section.section_key },
    });

    toast({ title: "↩️ Reverted", description: "Content loaded from selected version. Save draft or publish to apply." });
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Site Content</h2>
          <p className="text-sm text-muted-foreground">Edit content, save drafts, then publish when ready.</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <AlertCircle className="w-3 h-3" />
          Draft/Publish Mode
        </Badge>
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-foreground">
                  {getSectionLabel(section.section_key)}
                </h3>
                <Badge variant={editingSections[section.id]?.is_visible ? "default" : "secondary"}>
                  {editingSections[section.id]?.is_visible ? "Visible" : "Hidden"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => toggleVisibility(section.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {editingSections[section.id]?.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                {/* Version History */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchVersions(section.id)}
                    >
                      <History className="w-3 h-3 mr-1" />
                      History
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Version History – {getSectionLabel(section.section_key)}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-3">
                        {(versions[section.id] || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">No versions yet. Save a draft to start tracking.</p>
                        ) : (
                          (versions[section.id] || []).map((v) => (
                            <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={v.status === "published" ? "default" : "secondary"} className="text-xs">
                                    {v.status === "published" ? "Published" : "Draft"}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(v.created_at), "MMM d, yyyy h:mm a")}
                                  </span>
                                </div>
                                {v.draft_title && (
                                  <p className="text-sm text-foreground mt-1 truncate">{v.draft_title}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revertToVersion(section.id, v)}
                              >
                                <Undo2 className="w-3 h-3 mr-1" />
                                Revert
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>

                {/* Preview */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewSection(previewSection === section.id ? null : section.id)}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Preview
                </Button>

                {/* Save Draft */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveDraft(section.id)}
                  disabled={savingIds.has(section.id)}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {savingIds.has(section.id) ? "Saving..." : "Save Draft"}
                </Button>

                {/* Publish */}
                <Button
                  size="sm"
                  onClick={() => publishSection(section.id)}
                  disabled={publishingIds.has(section.id)}
                >
                  <Check className="w-3 h-3 mr-1" />
                  {publishingIds.has(section.id) ? "Publishing..." : "Publish"}
                </Button>
              </div>
            </div>

            {renderSectionFields(section)}

            {/* Preview Panel */}
            {previewSection === section.id && (
              <Card className="p-4 bg-muted/50 border-dashed border-2 border-accent/30">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium text-accent">Live Preview</span>
                </div>
                <div className="space-y-2 text-foreground">
                  <h3 className="text-2xl font-bold">{editingSections[section.id]?.title || "Untitled"}</h3>
                  <p className="text-muted-foreground">{editingSections[section.id]?.subtitle || ""}</p>
                  {section.section_key === "hero" && (
                    <div className="mt-2 space-y-1">
                      <p className="italic text-sm">"{String(editingSections[section.id]?.content?.tagline || "")}"</p>
                      <Badge>{String(editingSections[section.id]?.content?.cta_text || "CTA")}</Badge>
                    </div>
                  )}
                  {section.section_key === "testimonials" && (
                    <blockquote className="border-l-4 border-accent pl-4 mt-2 italic text-sm text-muted-foreground">
                      "{String(editingSections[section.id]?.content?.quote || "")}"
                      <footer className="mt-1 not-italic text-xs">
                        — {String(editingSections[section.id]?.content?.student_name || "Student")}, {String(editingSections[section.id]?.content?.grade || "")}
                      </footer>
                    </blockquote>
                  )}
                </div>
              </Card>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
