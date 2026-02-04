import { useState, useEffect } from "react";
import { RefreshCw, Edit, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContentSectionDrawer } from "@/components/admin/ContentSectionDrawer";
import { SortableSectionCard } from "@/components/admin/SortableSectionCard";
import { useContentSections, ContentSection } from "@/hooks/useContentSections";
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

export function ContentCMS() {
  const { sections: fetchedSections, isLoading, refetch } = useContentSections();
  const [localSections, setLocalSections] = useState<ContentSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<ContentSection | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  // Sync local sections with fetched sections when fetch completes
  useEffect(() => {
    if (fetchedSections.length > 0 && localSections.length === 0) {
      setLocalSections(fetchedSections);
    }
  }, [fetchedSections, localSections.length]);

  // Use local sections for display if available, otherwise use fetched
  const sections = localSections.length > 0 ? localSections : fetchedSections;

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

  const handleRefresh = () => {
    setLocalSections([]);
    refetch();
  };

  // Handle visibility toggle
  const handleVisibilityToggle = async (section: ContentSection, checked: boolean) => {
    // Optimistic update
    setLocalSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, is_visible: checked } : s))
    );

    try {
      const { error } = await supabase
        .from("content_sections")
        .update({ is_visible: checked })
        .eq("id", section.id);

      if (error) throw error;

      toast({
        title: "Visibility updated",
        description: `Section is now ${checked ? "visible" : "hidden"}`,
      });
    } catch (error) {
      console.error("Error updating visibility:", error);
      // Rollback
      setLocalSections((prev) =>
        prev.map((s) => (s.id === section.id ? { ...s, is_visible: !checked } : s))
      );
      toast({
        title: "Error",
        description: "Failed to update visibility",
        variant: "destructive",
      });
    }
  };

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
    setLocalSections(newSections);

    // Persist to database
    setIsUpdating(true);
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
      handleRefresh();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSectionUpdate = (updatedSection: ContentSection) => {
    setLocalSections((prev) =>
      prev.map((s) => (s.id === updatedSection.id ? updatedSection : s))
    );
  };

  const openEditor = (section: ContentSection) => {
    setSelectedSection(section);
    setIsDrawerOpen(true);
  };

  if (isLoading && sections.length === 0) {
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
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading || isUpdating}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
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
                isPending={isUpdating}
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
