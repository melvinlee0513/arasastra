import { useEffect, useState } from "react";
import { RefreshCw, Edit, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContentSectionDrawer } from "@/components/admin/ContentSectionDrawer";
import { SortableSectionCard } from "@/components/admin/SortableSectionCard";
import { useOptimisticMutation } from "@/hooks/useOptimisticMutation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  // Handle drag end - update order
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);

    // Optimistically update UI
    const newSections = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({
      ...s,
      display_order: i,
    }));
    setSections(newSections);

    // Persist to database
    try {
      const updates = newSections.map((s) => ({
        id: s.id,
        display_order: s.display_order,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("content_sections")
          .update({ display_order: update.display_order })
          .eq("id", update.id);
        if (error) throw error;
      }

      toast({
        title: "Order Updated",
        description: "Section order has been saved",
      });
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "Error",
        description: "Failed to save order. Refreshing...",
        variant: "destructive",
      });
      fetchSections(); // Rollback by refetching
    }
  };

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
            Drag sections to reorder • Click edit to customize
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
              Drag and drop to reorder. Changes save instantly.
            </p>
          </div>
        </div>
      </Card>

      {/* Section Manager with Drag & Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {sections.map((section) => (
              <SortableSectionCard
                key={section.id}
                section={section}
                onVisibilityToggle={handleVisibilityToggle}
                onEdit={openEditor}
                isPending={visibilityMutation.isPending}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
