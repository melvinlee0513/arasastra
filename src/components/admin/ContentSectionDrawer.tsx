import { useState, useEffect } from "react";
import { X, Save, Image, Type, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface ContentSection {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: Record<string, unknown>;
  is_visible: boolean;
  display_order: number;
}

interface ContentSectionDrawerProps {
  section: ContentSection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (section: ContentSection) => void;
}

export function ContentSectionDrawer({
  section,
  open,
  onOpenChange,
  onSave,
}: ContentSectionDrawerProps) {
  const [editedSection, setEditedSection] = useState<ContentSection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (section) {
      setEditedSection({ ...section });
    }
  }, [section]);

  const updateField = (field: keyof ContentSection, value: unknown) => {
    if (editedSection) {
      setEditedSection({ ...editedSection, [field]: value });
    }
  };

  const updateContent = (key: string, value: string) => {
    if (editedSection) {
      setEditedSection({
        ...editedSection,
        content: { ...editedSection.content, [key]: value },
      });
    }
  };

  const handleSave = async () => {
    if (!editedSection) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("content_sections")
        .update({
          title: editedSection.title,
          subtitle: editedSection.subtitle,
          content: editedSection.content as unknown as Record<string, never>,
          is_visible: editedSection.is_visible,
        })
        .eq("id", editedSection.id);

      if (error) throw error;

      // Optimistic update - update parent state immediately
      onSave(editedSection);
      
      toast({
        title: "Changes Saved",
        description: `${getSectionLabel(editedSection.section_key)} updated successfully`,
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving section:", error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
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

  const renderContentFields = () => {
    if (!editedSection) return null;

    switch (editedSection.section_key) {
      case "hero":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                Tagline
              </Label>
              <Input
                value={String(editedSection.content?.tagline || "")}
                onChange={(e) => updateContent("tagline", e.target.value)}
                placeholder="Your compelling tagline..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                CTA Button Text
              </Label>
              <Input
                value={String(editedSection.content?.cta_text || "")}
                onChange={(e) => updateContent("cta_text", e.target.value)}
                placeholder="Get Started"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="w-4 h-4" />
                Hero Image URL
              </Label>
              <Input
                value={String(editedSection.content?.hero_image || "")}
                onChange={(e) => updateContent("hero_image", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        );

      case "tutors":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Featured Tutor Name</Label>
              <Input
                value={String(editedSection.content?.featured_tutor || "")}
                onChange={(e) => updateContent("featured_tutor", e.target.value)}
                placeholder="Dr. Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <Label>Tutor Description</Label>
              <Textarea
                value={String(editedSection.content?.tutor_description || "")}
                onChange={(e) => updateContent("tutor_description", e.target.value)}
                placeholder="Brief description of the tutor..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Tutor Avatar URL</Label>
              <Input
                value={String(editedSection.content?.tutor_avatar || "")}
                onChange={(e) => updateContent("tutor_avatar", e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        );

      case "subjects":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Section Description</Label>
              <Textarea
                value={String(editedSection.content?.description || "")}
                onChange={(e) => updateContent("description", e.target.value)}
                placeholder="Describe your subjects..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Featured Subjects (comma-separated)</Label>
              <Input
                value={String(editedSection.content?.featured_subjects || "")}
                onChange={(e) => updateContent("featured_subjects", e.target.value)}
                placeholder="Math, Physics, Chemistry..."
              />
            </div>
          </div>
        );

      case "testimonials":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Quote</Label>
              <Textarea
                value={String(editedSection.content?.quote || "")}
                onChange={(e) => updateContent("quote", e.target.value)}
                placeholder="Student testimonial..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Student Name</Label>
              <Input
                value={String(editedSection.content?.student_name || "")}
                onChange={(e) => updateContent("student_name", e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>Grade/Form</Label>
              <Input
                value={String(editedSection.content?.grade || "")}
                onChange={(e) => updateContent("grade", e.target.value)}
                placeholder="Form 5"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-2">
            <Label>Custom Content (JSON)</Label>
            <Textarea
              value={JSON.stringify(editedSection.content, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setEditedSection({ ...editedSection, content: parsed });
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={10}
              className="font-mono text-sm"
            />
          </div>
        );
    }
  };

  if (!editedSection) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            Edit {getSectionLabel(editedSection.section_key)}
          </SheetTitle>
          <SheetDescription>
            Make changes to this section. Click save when you're done.
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Basic Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Section Title</Label>
              <Input
                value={editedSection.title || ""}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Section title..."
              />
            </div>

            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input
                value={editedSection.subtitle || ""}
                onChange={(e) => updateField("subtitle", e.target.value)}
                placeholder="Section subtitle..."
              />
            </div>
          </div>

          {/* Section-specific fields */}
          <div className="border-t border-border pt-6">
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Section Content
            </h4>
            {renderContentFields()}
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
