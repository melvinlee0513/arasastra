import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Edit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ContentSection {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  content: Record<string, unknown>;
  is_visible: boolean;
  display_order: number;
}

interface SortableSectionCardProps {
  section: ContentSection;
  onVisibilityToggle: (section: ContentSection, checked: boolean) => void;
  onEdit: (section: ContentSection) => void;
  isPending: boolean;
}

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

export function SortableSectionCard({
  section,
  onVisibilityToggle,
  onEdit,
  isPending,
}: SortableSectionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-6 bg-card border-border hover:shadow-lg transition-shadow ${
        isDragging ? "shadow-2xl ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors touch-none"
        >
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
                  onCheckedChange={(checked) => onVisibilityToggle(section, checked)}
                  disabled={isPending}
                />
              </div>

              {/* Edit Button */}
              <Button variant="outline" size="sm" onClick={() => onEdit(section)}>
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
  );
}
